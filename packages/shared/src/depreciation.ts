import type { Cents } from "./money.js";

/* Penyusutan aset tetap — metode garis lurus (straight-line). Murni & ditest. */

/** Angsuran penyusutan per bulan = (biaya − nilai residu) / masa manfaat (bulan). */
export function monthlyStraightLine(costCents: Cents, salvageCents: Cents, lifeMonths: number): Cents {
  if (lifeMonths <= 0) return 0;
  const base = Math.max(0, costCents - salvageCents);
  return Math.round(base / lifeMonths);
}

/** Sisa basis yang masih dapat disusutkan (tak boleh negatif). */
export function depreciableRemaining(costCents: Cents, salvageCents: Cents, accumulatedCents: Cents): Cents {
  return Math.max(0, costCents - salvageCents - accumulatedCents);
}

/**
 * Nilai penyusutan untuk satu run (`months` bulan), dibatasi sisa basis agar
 * akumulasi tak melampaui (biaya − residu).
 */
export function runAmount(
  costCents: Cents,
  salvageCents: Cents,
  lifeMonths: number,
  accumulatedCents: Cents,
  months = 1,
): Cents {
  const perMonth = monthlyStraightLine(costCents, salvageCents, lifeMonths);
  const remaining = depreciableRemaining(costCents, salvageCents, accumulatedCents);
  return Math.min(perMonth * Math.max(1, months), remaining);
}
