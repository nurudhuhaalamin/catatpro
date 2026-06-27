import type { AccountType, AccountingStandard } from "./types.js";

/**
 * Template Chart of Accounts (COA) Indonesia per standar.
 * - `subtype` adalah KUNCI SEMANTIK yang dipakai posting service untuk menemukan
 *   akun yang tepat (mis. "accounts_receivable") tanpa bergantung pada nomor akun.
 * - Penomoran mengikuti konvensi umum Indonesia:
 *   1=Aset, 2=Liabilitas, 3=Ekuitas, 4=Pendapatan, 5=HPP, 6=Beban, 7/8=lain-lain.
 */
export interface CoaTemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  normalBalance: "debit" | "credit";
  isDefault?: boolean; // default untuk subtype-nya saat dipakai posting otomatis
}

// Subtype semantik yang dikenali posting service.
export type AccountSubtype =
  | "cash_bank"
  | "accounts_receivable"
  | "inventory"
  | "tax_input"
  | "prepaid"
  | "fixed_asset"
  | "accumulated_depreciation"
  | "accounts_payable"
  | "tax_output"
  | "loan"
  | "equity"
  | "drawing"
  | "retained_earnings"
  | "revenue"
  | "other_income"
  | "cogs"
  | "expense"
  | "depreciation_expense"
  | "other_expense";

// COA inti SAK EMKM (paling ringkas).
const EMKM: CoaTemplateAccount[] = [
  // Aset
  { code: "1-10001", name: "Kas", type: "asset", subtype: "cash_bank", normalBalance: "debit", isDefault: true },
  { code: "1-10002", name: "Bank", type: "asset", subtype: "cash_bank", normalBalance: "debit" },
  { code: "1-10100", name: "Piutang Usaha", type: "asset", subtype: "accounts_receivable", normalBalance: "debit", isDefault: true },
  { code: "1-10200", name: "Persediaan Barang", type: "asset", subtype: "inventory", normalBalance: "debit", isDefault: true },
  { code: "1-10300", name: "PPN Masukan", type: "asset", subtype: "tax_input", normalBalance: "debit", isDefault: true },
  // Liabilitas
  { code: "2-20001", name: "Utang Usaha", type: "liability", subtype: "accounts_payable", normalBalance: "credit", isDefault: true },
  { code: "2-20100", name: "PPN Keluaran", type: "liability", subtype: "tax_output", normalBalance: "credit", isDefault: true },
  // Ekuitas
  { code: "3-30001", name: "Modal Pemilik", type: "equity", subtype: "equity", normalBalance: "credit", isDefault: true },
  { code: "3-30002", name: "Prive", type: "equity", subtype: "drawing", normalBalance: "debit", isDefault: true },
  { code: "3-30100", name: "Laba Ditahan", type: "equity", subtype: "retained_earnings", normalBalance: "credit", isDefault: true },
  // Pendapatan
  { code: "4-40001", name: "Pendapatan Penjualan", type: "income", subtype: "revenue", normalBalance: "credit", isDefault: true },
  { code: "4-40002", name: "Pendapatan Lain-lain", type: "income", subtype: "other_income", normalBalance: "credit", isDefault: true },
  // HPP
  { code: "5-50001", name: "Harga Pokok Penjualan", type: "expense", subtype: "cogs", normalBalance: "debit", isDefault: true },
  // Beban operasional
  { code: "6-60001", name: "Beban Gaji", type: "expense", subtype: "expense", normalBalance: "debit", isDefault: true },
  { code: "6-60002", name: "Beban Sewa", type: "expense", subtype: "expense", normalBalance: "debit" },
  { code: "6-60003", name: "Beban Listrik, Air & Telepon", type: "expense", subtype: "expense", normalBalance: "debit" },
  { code: "6-60009", name: "Beban Operasional Lain-lain", type: "expense", subtype: "expense", normalBalance: "debit" },
];

// Tambahan untuk SAK EP (akrual lebih lengkap).
const EP_EXTRA: CoaTemplateAccount[] = [
  { code: "1-10400", name: "Biaya Dibayar Dimuka", type: "asset", subtype: "prepaid", normalBalance: "debit", isDefault: true },
  { code: "1-10500", name: "Peralatan", type: "asset", subtype: "fixed_asset", normalBalance: "debit", isDefault: true },
  { code: "1-10600", name: "Akumulasi Penyusutan Peralatan", type: "asset", subtype: "accumulated_depreciation", normalBalance: "credit", isDefault: true },
  { code: "2-20200", name: "Utang Bank", type: "liability", subtype: "loan", normalBalance: "credit", isDefault: true },
  { code: "6-60005", name: "Beban Penyusutan", type: "expense", subtype: "depreciation_expense", normalBalance: "debit", isDefault: true },
  { code: "8-80001", name: "Beban Bunga", type: "expense", subtype: "other_expense", normalBalance: "debit", isDefault: true },
];

export function coaTemplate(standard: AccountingStandard): CoaTemplateAccount[] {
  switch (standard) {
    case "emkm":
      return EMKM;
    case "ep":
    case "sak":
      return [...EMKM, ...EP_EXTRA];
  }
}
