import { and, eq, isNull, asc } from "drizzle-orm";
import {
  fixedAssets,
  depreciationEntries,
  runAmount,
  monthlyStraightLine,
  buildManualJournal,
  debit,
  credit,
  type AccountSubtype,
  type AssetCreate,
  type DepreciateInput,
} from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { loadResolver } from "../lib/accounting.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

export function listAssets(tx: OrgDbTx, orgId: string) {
  const rows = tx
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), isNull(fixedAssets.deletedAt)))
    .orderBy(asc(fixedAssets.name))
    .all();
  return rows.map((a) => ({
    ...a,
    bookValueCents: a.costCents - a.accumulatedCents,
    monthlyCents: monthlyStraightLine(a.costCents, a.salvageValueCents, a.usefulLifeMonths),
  }));
}

// Daftarkan aset (akun default dari COA).
export function createAsset(tx: OrgDbTx, orgId: string, d: AssetCreate) {
  const resolve = loadResolver(tx, orgId);
  const tryResolve = (s: AccountSubtype, fallback: AccountSubtype) => {
    try {
      return resolve(s);
    } catch {
      return resolve(fallback);
    }
  };
  return tx
    .insert(fixedAssets)
    .values({
      orgId,
      name: d.name,
      acquisitionDate: d.acquisitionDate,
      costCents: d.costCents,
      salvageValueCents: d.salvageValueCents,
      usefulLifeMonths: d.usefulLifeMonths,
      assetAccountId: resolve("fixed_asset"),
      accumAccountId: resolve("accumulated_depreciation"),
      expenseAccountId: tryResolve("depreciation_expense", "expense"),
    })
    .returning()
    .get();
}

// Jalankan penyusutan: Dr Beban Penyusutan / Cr Akumulasi Penyusutan.
export function depreciateAsset(tx: OrgDbTx, orgId: string, assetId: string, d: DepreciateInput, userId: string) {
  assertPeriodOpen(tx, orgId, d.date);
  const asset = tx.select().from(fixedAssets).where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.id, assetId))).get();
  if (!asset) throw new Error("Aset tidak ditemukan");
  if (!asset.expenseAccountId || !asset.accumAccountId) throw new Error("Aset tanpa akun penyusutan");
  const amount = runAmount(asset.costCents, asset.salvageValueCents, asset.usefulLifeMonths, asset.accumulatedCents, d.months);
  if (amount <= 0) throw new Error("Aset sudah tersusut penuh");

  const draft = buildManualJournal(
    d.date,
    [...debit(asset.expenseAccountId, amount), ...credit(asset.accumAccountId, amount)],
    `Penyusutan ${asset.name}`,
  );
  const journalId = insertDraftJournal(tx, orgId, draft, { createdBy: userId });
  tx.insert(depreciationEntries).values({ orgId, assetId, date: d.date, amountCents: amount, journalId }).run();
  tx.update(fixedAssets).set({ accumulatedCents: asset.accumulatedCents + amount, updatedAt: new Date() }).where(eq(fixedAssets.id, assetId)).run();
  return { assetId, amountCents: amount, accumulatedCents: asset.accumulatedCents + amount };
}
