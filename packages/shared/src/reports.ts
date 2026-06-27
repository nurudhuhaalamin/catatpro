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
