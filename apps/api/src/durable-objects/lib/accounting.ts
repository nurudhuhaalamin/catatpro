import { and, eq, isNull, lte, gte, or, desc } from "drizzle-orm";
import { accounts, taxRates, makeAccountResolver, computeTax, type AccountLite } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

/** Muat COA org & buat resolver subtype→accountId (untuk posting otomatis). */
export function loadResolver(tx: OrgDbTx, orgId: string) {
  const rows = tx
    .select({ id: accounts.id, code: accounts.code, subtype: accounts.subtype, isPostable: accounts.isPostable })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), isNull(accounts.deletedAt)))
    .all();
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
export function resolveTax(
  tx: OrgDbTx,
  orgId: string,
  taxRateId: string | null | undefined,
  subtotalCents: number,
  dateIso: string,
): ResolvedTax {
  if (!taxRateId) return { taxRateId: null, taxCents: 0 };
  const rate = tx
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
    .get();
  if (!rate) return { taxRateId: null, taxCents: 0 };
  const taxCents = computeTax(subtotalCents, rate.rateBps, rate.dppFactorNum, rate.dppFactorDen);
  return { taxRateId: rate.id, taxCents };
}
