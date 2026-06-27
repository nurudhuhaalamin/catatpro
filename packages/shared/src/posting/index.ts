import type { Cents } from "../money.js";
import type { AccountSubtype } from "../coa.js";

/* -------------------------------------------------------------------------- */
/*  Posting service — domain double-entry MURNI (tanpa I/O).                    */
/*  API memanggil builder ini untuk menghasilkan jurnal berimbang, lalu        */
/*  menulis journals + journal_lines secara ATOMIK dalam satu transaksi DB.    */
/*  Setiap builder dijamin balance (Σdebit = Σkredit) via assertBalanced.      */
/* -------------------------------------------------------------------------- */

export interface DraftLine {
  accountId: string;
  debitCents: Cents;
  creditCents: Cents;
  contactId?: string | null;
  memo?: string | null;
}

export interface DraftJournal {
  date: string; // ISO date (YYYY-MM-DD)
  sourceType: string;
  sourceId?: string | null;
  memo?: string | null;
  lines: DraftLine[];
}

/** Buat baris debit (mengabaikan nol agar jurnal rapi). */
export function debit(accountId: string, cents: Cents, extra: Partial<DraftLine> = {}): DraftLine[] {
  return cents > 0 ? [{ accountId, debitCents: cents, creditCents: 0, ...extra }] : [];
}

/** Buat baris kredit (mengabaikan nol). */
export function credit(accountId: string, cents: Cents, extra: Partial<DraftLine> = {}): DraftLine[] {
  return cents > 0 ? [{ accountId, debitCents: 0, creditCents: cents, ...extra }] : [];
}

export function sumDebit(j: DraftJournal): Cents {
  return j.lines.reduce((s, l) => s + l.debitCents, 0);
}
export function sumCredit(j: DraftJournal): Cents {
  return j.lines.reduce((s, l) => s + l.creditCents, 0);
}

export function isBalanced(j: DraftJournal): boolean {
  return sumDebit(j) === sumCredit(j) && j.lines.length > 0;
}

/** Lempar error bila jurnal tidak berimbang / kosong — invarian wajib sebelum posting. */
export function assertBalanced(j: DraftJournal): DraftJournal {
  if (j.lines.length === 0) throw new Error("Jurnal tidak boleh kosong");
  const d = sumDebit(j);
  const c = sumCredit(j);
  if (d !== c) throw new Error(`Jurnal tidak berimbang: debit ${d} != kredit ${c}`);
  if (d === 0) throw new Error("Jurnal bernilai nol");
  return j;
}

/* ----------------------------- account resolver -------------------------- */

export interface AccountLite {
  id: string;
  code: string;
  subtype: string | null;
  isPostable?: boolean;
}

/**
 * Resolver akun default per subtype semantik (mis. "accounts_receivable").
 * Memilih akun postable dengan kode terkecil untuk subtype tsb.
 */
export function makeAccountResolver(accounts: AccountLite[]) {
  const bySubtype = new Map<string, AccountLite>();
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    if (a.isPostable === false || !a.subtype) continue;
    if (!bySubtype.has(a.subtype)) bySubtype.set(a.subtype, a);
  }
  return (subtype: AccountSubtype): string => {
    const a = bySubtype.get(subtype);
    if (!a) throw new Error(`Akun default untuk "${subtype}" tidak ditemukan di COA`);
    return a.id;
  };
}

/* --------------------------------- builders ------------------------------ */

export interface CashEntryInput {
  date: string;
  direction: "in" | "out";
  cashAccountId: string;
  counterAccountId: string; // pendapatan (in) atau beban (out)
  amountCents: Cents;
  contactId?: string | null;
  memo?: string | null;
  sourceId?: string | null;
}

/** Kas masuk: Dr Kas / Cr akun lawan. Kas keluar: Dr akun lawan / Cr Kas. */
export function buildCashJournal(i: CashEntryInput): DraftJournal {
  const lines =
    i.direction === "in"
      ? [...debit(i.cashAccountId, i.amountCents), ...credit(i.counterAccountId, i.amountCents, { contactId: i.contactId })]
      : [...debit(i.counterAccountId, i.amountCents, { contactId: i.contactId }), ...credit(i.cashAccountId, i.amountCents)];
  return assertBalanced({
    date: i.date,
    sourceType: i.direction === "in" ? "cash_receipt" : "cash_payment",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface TransferInput {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: Cents;
  memo?: string | null;
  sourceId?: string | null;
}

/** Transfer antar kas/bank: Dr tujuan / Cr asal (bukan laba-rugi). */
export function buildTransferJournal(i: TransferInput): DraftJournal {
  return assertBalanced({
    date: i.date,
    sourceType: "transfer",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines: [...debit(i.toAccountId, i.amountCents), ...credit(i.fromAccountId, i.amountCents)],
  });
}

export interface SalesInvoiceInput {
  date: string;
  contactId: string;
  arAccountId: string;
  revenueAccountId: string;
  subtotalCents: Cents;
  taxCents?: Cents;
  taxOutputAccountId?: string | null;
  // HPP otomatis (opsional, bila modul inventory aktif)
  cogsCents?: Cents;
  cogsAccountId?: string | null;
  inventoryAccountId?: string | null;
  sourceId?: string | null;
  memo?: string | null;
}

/**
 * Faktur penjualan: Dr Piutang / Cr Pendapatan / Cr PPN Keluaran.
 * Bila ada HPP: Dr HPP / Cr Persediaan.
 */
export function buildSalesInvoiceJournal(i: SalesInvoiceInput): DraftJournal {
  const tax = i.taxCents ?? 0;
  const total = i.subtotalCents + tax;
  const lines: DraftLine[] = [
    ...debit(i.arAccountId, total, { contactId: i.contactId }),
    ...credit(i.revenueAccountId, i.subtotalCents),
  ];
  if (tax > 0) {
    if (!i.taxOutputAccountId) throw new Error("taxOutputAccountId wajib bila ada PPN");
    lines.push(...credit(i.taxOutputAccountId, tax));
  }
  if (i.cogsCents && i.cogsCents > 0) {
    if (!i.cogsAccountId || !i.inventoryAccountId) throw new Error("Akun HPP & Persediaan wajib bila ada HPP");
    lines.push(...debit(i.cogsAccountId, i.cogsCents), ...credit(i.inventoryAccountId, i.cogsCents));
  }
  return assertBalanced({
    date: i.date,
    sourceType: "sales_invoice",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface AmountLine {
  accountId: string;
  amountCents: Cents;
}

// Baris HPP (perpetual): Dr HPP / Cr Persediaan saat barang stok terjual.
export interface CogsLine {
  cogsAccountId: string;
  inventoryAccountId: string;
  amountCents: Cents;
}

export interface SalesInvoiceLinesInput {
  date: string;
  contactId: string;
  arAccountId: string;
  revenueLines: AmountLine[]; // satu baris per akun pendapatan
  taxCents?: Cents;
  taxOutputAccountId?: string | null;
  cogsLines?: CogsLine[]; // HPP otomatis untuk item stok (opsional)
  sourceId?: string | null;
  memo?: string | null;
}

/**
 * Faktur penjualan multi-baris (akun pendapatan bisa berbeda per baris):
 * Dr Piutang (subtotal+PPN) / Cr tiap akun pendapatan / Cr PPN Keluaran.
 * Bila ada item stok: Dr HPP / Cr Persediaan per baris HPP (perpetual).
 */
export function buildSalesInvoiceJournalFromLines(i: SalesInvoiceLinesInput): DraftJournal {
  const subtotal = i.revenueLines.reduce((s, l) => s + l.amountCents, 0);
  const tax = i.taxCents ?? 0;
  const total = subtotal + tax;
  const lines: DraftLine[] = [...debit(i.arAccountId, total, { contactId: i.contactId })];
  for (const l of i.revenueLines) lines.push(...credit(l.accountId, l.amountCents));
  if (tax > 0) {
    if (!i.taxOutputAccountId) throw new Error("taxOutputAccountId wajib bila ada PPN");
    lines.push(...credit(i.taxOutputAccountId, tax));
  }
  for (const cg of i.cogsLines ?? []) {
    lines.push(...debit(cg.cogsAccountId, cg.amountCents), ...credit(cg.inventoryAccountId, cg.amountCents));
  }
  return assertBalanced({
    date: i.date,
    sourceType: "sales_invoice",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface PurchaseBillLinesInput {
  date: string;
  contactId: string;
  apAccountId: string;
  debitLines: AmountLine[]; // persediaan/beban per baris
  taxCents?: Cents;
  taxInputAccountId?: string | null;
  sourceId?: string | null;
  memo?: string | null;
}

/**
 * Tagihan pembelian multi-baris:
 * Dr tiap akun persediaan/beban + Dr PPN Masukan / Cr Utang Usaha (subtotal+PPN).
 */
export function buildPurchaseBillJournalFromLines(i: PurchaseBillLinesInput): DraftJournal {
  const subtotal = i.debitLines.reduce((s, l) => s + l.amountCents, 0);
  const tax = i.taxCents ?? 0;
  const total = subtotal + tax;
  const lines: DraftLine[] = [];
  for (const l of i.debitLines) lines.push(...debit(l.accountId, l.amountCents));
  if (tax > 0) {
    if (!i.taxInputAccountId) throw new Error("taxInputAccountId wajib bila ada PPN");
    lines.push(...debit(i.taxInputAccountId, tax));
  }
  lines.push(...credit(i.apAccountId, total, { contactId: i.contactId }));
  return assertBalanced({
    date: i.date,
    sourceType: "purchase_bill",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface PurchaseBillInput {
  date: string;
  contactId: string;
  apAccountId: string;
  // akun debet: persediaan (barang) atau beban (jasa/biaya)
  debitAccountId: string;
  subtotalCents: Cents;
  taxCents?: Cents;
  taxInputAccountId?: string | null;
  sourceId?: string | null;
  memo?: string | null;
}

/** Tagihan pembelian: Dr Persediaan/Beban + Dr PPN Masukan / Cr Utang Usaha. */
export function buildPurchaseBillJournal(i: PurchaseBillInput): DraftJournal {
  const tax = i.taxCents ?? 0;
  const total = i.subtotalCents + tax;
  const lines: DraftLine[] = [...debit(i.debitAccountId, i.subtotalCents)];
  if (tax > 0) {
    if (!i.taxInputAccountId) throw new Error("taxInputAccountId wajib bila ada PPN");
    lines.push(...debit(i.taxInputAccountId, tax));
  }
  lines.push(...credit(i.apAccountId, total, { contactId: i.contactId }));
  return assertBalanced({
    date: i.date,
    sourceType: "purchase_bill",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface SettlementInput {
  date: string;
  kind: "receive" | "pay"; // receive = pelunasan piutang; pay = pelunasan utang
  cashAccountId: string;
  contactAccountId: string; // AR (receive) atau AP (pay)
  contactId: string;
  amountCents: Cents;
  sourceId?: string | null;
  memo?: string | null;
}

/** Pelunasan: terima -> Dr Kas / Cr Piutang; bayar -> Dr Utang / Cr Kas. */
export function buildSettlementJournal(i: SettlementInput): DraftJournal {
  const lines =
    i.kind === "receive"
      ? [...debit(i.cashAccountId, i.amountCents), ...credit(i.contactAccountId, i.amountCents, { contactId: i.contactId })]
      : [...debit(i.contactAccountId, i.amountCents, { contactId: i.contactId }), ...credit(i.cashAccountId, i.amountCents)];
  return assertBalanced({
    date: i.date,
    sourceType: i.kind === "receive" ? "receipt" : "payment",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

export interface FxSettlementInput {
  date: string;
  kind: "receive" | "pay";
  cashAccountId: string;
  contactAccountId: string; // AR (receive) / AP (pay)
  contactId: string;
  cashBaseCents: Cents; // nilai kas (mata uang dasar) pada kurs pembayaran
  counterBaseCents: Cents; // nilai AR/AP dilepas (mata uang dasar) pada kurs dokumen
  fxGainCents: Cents; // + = laba selisih kurs, − = rugi
  fxGainAccountId: string;
  fxLossAccountId: string;
  sourceId?: string | null;
  memo?: string | null;
}

/**
 * Pelunasan mata uang asing dengan selisih kurs:
 * - receive: Dr Kas(kurs bayar) / Cr Piutang(kurs dokumen) / Cr Laba Selisih Kurs (atau Dr Rugi)
 * - pay:     Dr Utang(kurs dokumen) / Cr Kas(kurs bayar) / Cr Laba (atau Dr Rugi)
 */
export function buildFxSettlementJournal(i: FxSettlementInput): DraftJournal {
  const lines: DraftLine[] = [];
  if (i.kind === "receive") {
    lines.push(...debit(i.cashAccountId, i.cashBaseCents));
    lines.push(...credit(i.contactAccountId, i.counterBaseCents, { contactId: i.contactId }));
  } else {
    lines.push(...debit(i.contactAccountId, i.counterBaseCents, { contactId: i.contactId }));
    lines.push(...credit(i.cashAccountId, i.cashBaseCents));
  }
  if (i.fxGainCents > 0) lines.push(...credit(i.fxGainAccountId, i.fxGainCents));
  else if (i.fxGainCents < 0) lines.push(...debit(i.fxLossAccountId, -i.fxGainCents));
  return assertBalanced({
    date: i.date,
    sourceType: i.kind === "receive" ? "receipt" : "payment",
    sourceId: i.sourceId ?? null,
    memo: i.memo ?? null,
    lines,
  });
}

/** Jurnal manual (mode pro): pakai baris apa adanya, tetap divalidasi balance. */
export function buildManualJournal(date: string, lines: DraftLine[], memo?: string | null): DraftJournal {
  return assertBalanced({ date, sourceType: "manual", memo: memo ?? null, lines });
}

/** Jurnal pembalik untuk koreksi: tukar debit<->kredit. */
export function buildReversalJournal(source: DraftJournal, date: string, memo?: string | null): DraftJournal {
  const lines = source.lines.map((l) => ({
    ...l,
    debitCents: l.creditCents,
    creditCents: l.debitCents,
  }));
  return assertBalanced({
    date,
    sourceType: `reversal:${source.sourceType}`,
    sourceId: source.sourceId ?? null,
    memo: memo ?? `Pembalik: ${source.memo ?? source.sourceType}`,
    lines,
  });
}
