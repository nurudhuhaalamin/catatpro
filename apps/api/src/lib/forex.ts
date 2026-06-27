import { and, eq, lte, desc } from "drizzle-orm";
import { organizations, exchangeRates } from "@catatpro/shared";
import type { DbTx } from "../db.js";

/**
 * Tentukan kurs (base per 1 unit asing × 1e6) untuk dokumen.
 * - mata uang = mata uang dasar org → 1e6
 * - `override` diberikan → pakai itu (kurs yang dikunci pengguna)
 * - selain itu → kurs terbaru ≤ tanggal dari tabel exchange_rates (atau error)
 */
export async function resolveRate(
  tx: DbTx,
  orgId: string,
  currency: string | undefined,
  dateIso: string,
  override?: number,
): Promise<{ currency: string; rateMicros: number }> {
  const [org] = await tx.select({ base: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, orgId));
  const base = org?.base ?? "IDR";
  if (!currency || currency === base) return { currency: base, rateMicros: 1_000_000 };
  if (override && override > 0) return { currency, rateMicros: override };
  const [r] = await tx
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.orgId, orgId), eq(exchangeRates.currency, currency), lte(exchangeRates.validFrom, dateIso)))
    .orderBy(desc(exchangeRates.validFrom))
    .limit(1);
  if (!r) throw new Error(`Kurs ${currency} belum diset untuk tanggal ${dateIso}`);
  return { currency, rateMicros: r.rateMicros };
}
