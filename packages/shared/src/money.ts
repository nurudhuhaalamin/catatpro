/* Helper uang. Semua nilai disimpan sebagai integer "sen" (cents). */

export type Cents = number;

export const RATE_SCALE = 1_000_000; // kurs disimpan sebagai integer × 1e6

/**
 * Konversi nilai mata uang dokumen (asing) ke mata uang dasar.
 * baseCents = round(foreignCents × rateMicros / 1e6). Untuk mata uang dasar, rateMicros = 1e6.
 */
export function convertToBase(foreignCents: Cents, rateMicros: number): Cents {
  return Math.round((foreignCents * rateMicros) / RATE_SCALE);
}

// Format sen -> tampilan mata uang (mengikuti pola catat, default IDR id-ID).
export function formatMoney(cents: Cents, currency = "IDR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(value);
  } catch {
    return value.toLocaleString("id-ID");
  }
}

/**
 * Hitung PPN dari nilai bruto/harga dengan skema DPP Nilai Lain.
 * Tarif efektif = rateBps/10000 * (dppFactorNum/dppFactorDen).
 * Contoh PPN 2026 non-mewah: rateBps=1200, num=11, den=12 -> efektif 11%.
 * Pembulatan setengah-ke-atas pada sen.
 */
export function computeTax(
  baseCents: Cents,
  rateBps: number,
  dppFactorNum = 1,
  dppFactorDen = 1,
): Cents {
  const tax = (baseCents * rateBps * dppFactorNum) / (10000 * dppFactorDen);
  return Math.round(tax);
}
