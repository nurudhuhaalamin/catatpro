import { and, eq, isNull, lte, gte, or, desc } from "drizzle-orm";
import { accounts, taxRates, makeAccountResolver, computeTax, type AccountLite } from "@catatpro/shared";
import type { DbTx } from "../db.js";

/** Muat COA org & buat resolver subtype→accountId (untuk posting otomatis). */
export async function loadResolver(tx: DbTx, orgId: string) {
  const rows = await tx
    .select({ id: accounts.id, code: accounts.code, subtype: accounts.subtype, isPostable: accounts.isPostable })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), isNull(accounts.deletedAt)));
  return makeAccountResolver(rows as AccountLite[]);
}

export interface ResolvedTax {
  taxRateId: string | null;
  taxCents: number;
}

/**
 * Hitung PPN untuk subtotal memakai tarif yang berlaku pada `dateIso`.
 * Bila `taxRateId` diberikan pakai itu; jika tidak, tanpa pajak (0).
 */
export async function resolveTax(
  tx: DbTx,
  orgId: string,
  taxRateId: string | null | undefined,
  subtotalCents: number,
  dateIso: string,
): Promise<ResolvedTax> {
  if (!taxRateId) return { taxRateId: null, taxCents: 0 };
  const [rate] = await tx
    .select()
    .from(taxRates)
    .where(
      and(
        eq(taxRates.orgId, orgId),
        eq(taxRates.id, taxRateId),
        lte(taxRates.validFrom, dateIso),
        or(isNull(taxRates.validTo), gte(taxRates.validTo, dateIso)),
      ),
    )
    .orderBy(desc(taxRates.validFrom))
    .limit(1);
  if (!rate) return { taxRateId: null, taxCents: 0 };
  const taxCents = computeTax(subtotalCents, rate.rateBps, rate.dppFactorNum, rate.dppFactorDen);
  return { taxRateId: rate.id, taxCents };
}
