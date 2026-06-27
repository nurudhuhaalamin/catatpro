import type { AccountType } from "./types.js";

/* Klasifikasi arus kas (metode langsung) berdasar akun lawan dari pergerakan kas. */

export type CashFlowCategory = "operating" | "investing" | "financing";

/**
 * Tentukan kategori arus kas dari sifat akun LAWAN (bukan akun kas):
 * - investasi: aset tetap & akumulasi penyusutan
 * - pendanaan: pinjaman (loan) & ekuitas (modal/prive/laba ditahan)
 * - operasional: sisanya (pendapatan, beban, piutang, utang, persediaan, pajak)
 */
export function classifyCashFlow(type: AccountType, subtype: string | null): CashFlowCategory {
  if (subtype === "fixed_asset" || subtype === "accumulated_depreciation") return "investing";
  if (subtype === "loan" || type === "equity") return "financing";
  return "operating";
}
