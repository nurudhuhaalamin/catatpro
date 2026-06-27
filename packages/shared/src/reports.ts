import type { Cents } from "./money.js";

/* Helper laporan MURNI (dipakai tes & ringkasan klien). Laporan otoritatif tetap
   dihitung di server via agregasi SQL pada journal_lines. */

export interface LedgerLine {
  accountId: string;
  debitCents: Cents;
  creditCents: Cents;
}

export interface TrialBalanceRow {
  accountId: string;
  debitCents: Cents;
  creditCents: Cents;
  balanceCents: Cents; // debit - credit
}

/** Neraca saldo per akun dari kumpulan baris buku besar. */
export function trialBalance(lines: LedgerLine[]): TrialBalanceRow[] {
  const map = new Map<string, TrialBalanceRow>();
  for (const l of lines) {
    const row = map.get(l.accountId) ?? { accountId: l.accountId, debitCents: 0, creditCents: 0, balanceCents: 0 };
    row.debitCents += l.debitCents;
    row.creditCents += l.creditCents;
    row.balanceCents = row.debitCents - row.creditCents;
    map.set(l.accountId, row);
  }
  return [...map.values()];
}

/** Invarian inti: total debit == total kredit di seluruh buku besar. */
export function isLedgerBalanced(lines: LedgerLine[]): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += l.debitCents;
    c += l.creditCents;
  }
  return d === c;
}

export interface AgingDoc {
  dueDate?: string | null; // ISO date; null dianggap jatuh tempo pada tanggal dokumen
  date: string;
  outstandingCents: Cents;
}

export interface AgingBuckets {
  current: Cents; // belum jatuh tempo
  d1_30: Cents;
  d31_60: Cents;
  d61_90: Cents;
  d90plus: Cents;
  total: Cents;
}

const daysBetween = (a: string, b: string) =>
  Math.floor((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Kelompokkan umur (aging) piutang/hutang relatif terhadap `asOf`. */
export function agingBuckets(docs: AgingDoc[], asOf: string): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  for (const doc of docs) {
    if (doc.outstandingCents <= 0) continue;
    const due = doc.dueDate ?? doc.date;
    const overdue = daysBetween(asOf, due);
    if (overdue <= 0) b.current += doc.outstandingCents;
    else if (overdue <= 30) b.d1_30 += doc.outstandingCents;
    else if (overdue <= 60) b.d31_60 += doc.outstandingCents;
    else if (overdue <= 90) b.d61_90 += doc.outstandingCents;
    else b.d90plus += doc.outstandingCents;
    b.total += doc.outstandingCents;
  }
  return b;
}
