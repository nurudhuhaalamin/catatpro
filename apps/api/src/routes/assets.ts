import { Hono } from "hono";
import { and, eq, isNull, asc } from "drizzle-orm";
import {
  fixedAssets,
  depreciationEntries,
  assetCreateSchema,
  depreciateSchema,
  runAmount,
  monthlyStraightLine,
  buildManualJournal,
  debit,
  credit,
  type AccountSubtype,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver } from "../lib/accounting.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

const app = new Hono<AppContext>();

// Daftar aset + nilai buku & angsuran/bln.
app.get("/:orgId/assets", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), isNull(fixedAssets.deletedAt)))
    .orderBy(asc(fixedAssets.name));
  return c.json(
    rows.map((a) => ({
      ...a,
      bookValueCents: a.costCents - a.accumulatedCents,
      monthlyCents: monthlyStraightLine(a.costCents, a.salvageValueCents, a.usefulLifeMonths),
    })),
  );
});

// Daftarkan aset (akun default dari COA).
app.post("/:orgId/assets", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = assetCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Aset tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  try {
    const row = await c.var.db.transaction(async (tx) => {
      const resolve = await loadResolver(tx, orgId);
      const tryResolve = (s: AccountSubtype, fallback: AccountSubtype) => {
        try {
          return resolve(s);
        } catch {
          return resolve(fallback);
        }
      };
      const [asset] = await tx
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
        .returning();
      return asset;
    });
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Jalankan penyusutan: Dr Beban Penyusutan / Cr Akumulasi Penyusutan.
app.post("/:orgId/assets/:assetId/depreciate", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const assetId = c.req.param("assetId");
  const parsed = depreciateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Input tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  try {
    const result = await c.var.db.transaction(async (tx) => {
      await assertPeriodOpen(tx, orgId, d.date);
      const [asset] = await tx.select().from(fixedAssets).where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.id, assetId)));
      if (!asset) throw new Error("Aset tidak ditemukan");
      if (!asset.expenseAccountId || !asset.accumAccountId) throw new Error("Aset tanpa akun penyusutan");
      const amount = runAmount(asset.costCents, asset.salvageValueCents, asset.usefulLifeMonths, asset.accumulatedCents, d.months);
      if (amount <= 0) throw new Error("Aset sudah tersusut penuh");

      const draft = buildManualJournal(
        d.date,
        [...debit(asset.expenseAccountId, amount), ...credit(asset.accumAccountId, amount)],
        `Penyusutan ${asset.name}`,
      );
      const journalId = await insertDraftJournal(tx, orgId, draft, { createdBy: c.var.user.id });
      await tx.insert(depreciationEntries).values({ orgId, assetId, date: d.date, amountCents: amount, journalId });
      await tx.update(fixedAssets).set({ accumulatedCents: asset.accumulatedCents + amount, updatedAt: new Date() }).where(eq(fixedAssets.id, assetId));
      return { assetId, amountCents: amount, accumulatedCents: asset.accumulatedCents + amount };
    });
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
