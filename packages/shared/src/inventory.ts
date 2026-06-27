import type { Cents } from "./money.js";

/* Penilaian persediaan — Rata-rata Bergerak (moving average). Murni & ditest. */

/**
 * Biaya rata-rata baru setelah penerimaan stok.
 * avg' = (oldQty*oldAvg + inQty*inCost) / (oldQty + inQty), dibulatkan ke sen.
 * Bila total qty 0, kembalikan inCost.
 */
export function movingAverage(oldQty: number, oldAvgCents: Cents, inQty: number, inCostCents: Cents): Cents {
  const totalQty = oldQty + inQty;
  if (totalQty <= 0) return inCostCents;
  return Math.round((oldQty * oldAvgCents + inQty * inCostCents) / totalQty);
}

/** Nilai persediaan = qty × biaya rata-rata. */
export function stockValue(qty: number, avgCostCents: Cents): Cents {
  return qty * avgCostCents;
}
