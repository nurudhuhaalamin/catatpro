import { and, eq, lte, desc } from "drizzle-orm";
import { exchangeRates } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { readOrgMeta } from "./org-meta.js";

/**
 * Tentukan kurs (base per 1 unit asing × 1e6) untuk dokumen.
 * - mata uang = mata uang dasar org → 1e6
 * - `override` diberikan → pakai itu (kurs yang dikunci pengguna)
 * - selain itu → kurs terbaru ≤ tanggal dari tabel exchange_rates (atau error)
 *
 * `baseCurrency` org disimpan di `org_meta` (di-seed saat organisasi dibuat) —
 * BUKAN dibaca dari tabel `organizations`, karena tabel itu kini di D1
 * (control plane), di luar storage OrgDO ini.
 */
export function resolveRate(
  tx: OrgDbTx,
  orgId: string,
  currency: string | undefined,
  dateIso: string,
  override?: number,
): { currency: string; rateMicros: number } {
  const base = readOrgMeta(tx, "baseCurrency") ?? "IDR";
  if (!currency || currency === base) return { currency: base, rateMicros: 1_000_000 };
  if (override && override > 0) return { currency, rateMicros: override };
  const r = tx
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.orgId, orgId), eq(exchangeRates.currency, currency), lte(exchangeRates.validFrom, dateIso)))
    .orderBy(desc(exchangeRates.validFrom))
    .get();
  if (!r) throw new Error(`Kurs ${currency} belum diset untuk tanggal ${dateIso}`);
  return { currency, rateMicros: r.rateMicros };
}
