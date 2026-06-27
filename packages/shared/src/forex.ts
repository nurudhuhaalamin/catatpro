import { convertToBase, type Cents } from "./money.js";

/* Selisih kurs (FX) terealisasi saat pelunasan dokumen mata uang asing. */

export interface FxAllocation {
  foreignCents: Cents; // jumlah dialokasikan dalam mata uang dokumen
  docRateMicros: number; // kurs saat dokumen dibuat (AR/AP dibukukan di kurs ini)
}

export interface FxSettlement {
  cashBaseCents: Cents; // nilai kas (mata uang dasar) pada kurs pembayaran
  counterBaseCents: Cents; // nilai AR/AP yang dilepas (mata uang dasar) pada kurs dokumen
  /**
   * Selisih kurs (mata uang dasar) dari sisi pemilik:
   * - receive (piutang): kas − AR  (positif = laba)
   * - pay (utang):       AP  − kas (positif = laba)
   */
  fxGainCents: Cents;
}

/**
 * Hitung dampak pelunasan mata uang asing terhadap buku besar.
 * `paymentRateMicros` = kurs pada tanggal pembayaran.
 */
export function fxOnSettlement(
  kind: "receive" | "pay",
  allocations: FxAllocation[],
  paymentRateMicros: number,
): FxSettlement {
  let cashBaseCents = 0;
  let counterBaseCents = 0;
  for (const a of allocations) {
    cashBaseCents += convertToBase(a.foreignCents, paymentRateMicros);
    counterBaseCents += convertToBase(a.foreignCents, a.docRateMicros);
  }
  const fxGainCents = kind === "receive" ? cashBaseCents - counterBaseCents : counterBaseCents - cashBaseCents;
  return { cashBaseCents, counterBaseCents, fxGainCents };
}
