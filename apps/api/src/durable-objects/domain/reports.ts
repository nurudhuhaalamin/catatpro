import { and, eq, isNull, ne, lt, gte, lte, sql, asc, inArray } from "drizzle-orm";
import {
  accounts,
  journals,
  journalLines,
  salesInvoices,
  purchaseBills,
  agingBuckets,
  classifyCashFlow,
  type AgingDoc,
} from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

// Saldo per akun (debit, credit) dari buku besar — dasar semua laporan.
function accountBalances(tx: OrgDbTx, orgId: string) {
  const rows = tx
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      subtype: accounts.subtype,
      debitCents: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
      creditCents: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .where(and(eq(accounts.orgId, orgId), isNull(accounts.deletedAt)))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type, accounts.subtype)
    .orderBy(asc(accounts.code))
    .all();
  return rows.map((r) => ({
    ...r,
    debitCents: Number(r.debitCents),
    creditCents: Number(r.creditCents),
    balanceCents: Number(r.debitCents) - Number(r.creditCents),
  }));
}

export function trialBalance(tx: OrgDbTx, orgId: string) {
  const rows = accountBalances(tx, orgId);
  const totalDebit = rows.reduce((s, r) => s + r.debitCents, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditCents, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function incomeStatement(tx: OrgDbTx, orgId: string) {
  const rows = accountBalances(tx, orgId);
  const income = rows.filter((r) => r.type === "income").map((r) => ({ ...r, amountCents: r.creditCents - r.debitCents }));
  const expense = rows.filter((r) => r.type === "expense").map((r) => ({ ...r, amountCents: r.debitCents - r.creditCents }));
  const totalIncome = income.reduce((s, r) => s + r.amountCents, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amountCents, 0);
  return { income, expense, totalIncome, totalExpense, netIncomeCents: totalIncome - totalExpense };
}

export function balanceSheet(tx: OrgDbTx, orgId: string) {
  const rows = accountBalances(tx, orgId);
  const assets = rows.filter((r) => r.type === "asset").map((r) => ({ ...r, amountCents: r.balanceCents }));
  const liabilities = rows.filter((r) => r.type === "liability").map((r) => ({ ...r, amountCents: -r.balanceCents }));
  const equity = rows.filter((r) => r.type === "equity").map((r) => ({ ...r, amountCents: -r.balanceCents }));
  const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s - r.balanceCents, 0);
  const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.balanceCents, 0);
  const netIncomeCents = totalIncome - totalExpense;

  const totalAssets = assets.reduce((s, r) => s + r.amountCents, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amountCents, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amountCents, 0) + netIncomeCents;
  return {
    assets,
    liabilities,
    equity,
    netIncomeCents,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

export function ledger(tx: OrgDbTx, orgId: string, accountId: string) {
  const rows = tx
    .select({
      journalId: journals.id,
      date: journals.date,
      number: journals.number,
      memo: journalLines.memo,
      debitCents: journalLines.debitCents,
      creditCents: journalLines.creditCents,
    })
    .from(journalLines)
    .innerJoin(journals, eq(journalLines.journalId, journals.id))
    .where(and(eq(journalLines.orgId, orgId), eq(journalLines.accountId, accountId)))
    .orderBy(asc(journals.date))
    .all();
  let running = 0;
  const data = rows.map((r) => {
    running += Number(r.debitCents) - Number(r.creditCents);
    return { ...r, debitCents: Number(r.debitCents), creditCents: Number(r.creditCents), balanceCents: running };
  });
  return { accountId, rows: data };
}

// Aging Piutang (AR) / Hutang (AP).
function aging(tx: OrgDbTx, orgId: string, kind: "ar" | "ap", asOf: string) {
  const table = kind === "ar" ? salesInvoices : purchaseBills;
  const rows = tx
    .select({ date: table.date, dueDate: table.dueDate, totalCents: table.totalCents, paidCents: table.paidCents })
    .from(table)
    .where(and(eq(table.orgId, orgId), isNull(table.deletedAt), ne(table.status, "paid")))
    .all();
  const docs: AgingDoc[] = rows.map((r) => ({
    date: r.date,
    dueDate: r.dueDate,
    outstandingCents: Number(r.totalCents) - Number(r.paidCents),
  }));
  return agingBuckets(docs, asOf);
}

export function arAging(tx: OrgDbTx, orgId: string, asOf: string) {
  return aging(tx, orgId, "ar", asOf);
}
export function apAging(tx: OrgDbTx, orgId: string, asOf: string) {
  return aging(tx, orgId, "ap", asOf);
}

// Ringkasan PPN: keluaran (penjualan) − masukan (pembelian) = PPN terutang.
export function taxSummary(tx: OrgDbTx, orgId: string, from: string, to: string) {
  const outRows = tx
    .select({ number: salesInvoices.number, date: salesInvoices.date, npwp: salesInvoices.counterpartyNpwp, dpp: salesInvoices.subtotalCents, ppn: salesInvoices.taxCents })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.orgId, orgId), isNull(salesInvoices.deletedAt), gte(salesInvoices.date, from), lte(salesInvoices.date, to)))
    .all();
  const inRows = tx
    .select({ number: purchaseBills.number, date: purchaseBills.date, npwp: purchaseBills.counterpartyNpwp, dpp: purchaseBills.subtotalCents, ppn: purchaseBills.taxCents })
    .from(purchaseBills)
    .where(and(eq(purchaseBills.orgId, orgId), isNull(purchaseBills.deletedAt), gte(purchaseBills.date, from), lte(purchaseBills.date, to)))
    .all();
  const outputCents = outRows.reduce((s, r) => s + Number(r.ppn), 0);
  const inputCents = inRows.reduce((s, r) => s + Number(r.ppn), 0);
  return {
    range: { from, to },
    outputCents,
    inputCents,
    payableCents: outputCents - inputCents,
    outputDocs: outRows,
    inputDocs: inRows,
  };
}

// Arus Kas (metode langsung): klasifikasi pergerakan akun kas/bank.
export function cashFlow(tx: OrgDbTx, orgId: string, from: string, to: string) {
  const cashAccts = tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.subtype, "cash_bank"), isNull(accounts.deletedAt)))
    .all();
  const cashIds = new Set(cashAccts.map((a) => a.id));
  if (cashIds.size === 0) {
    return { range: { from, to }, beginningCents: 0, operatingCents: 0, investingCents: 0, financingCents: 0, netChangeCents: 0, endingCents: 0 };
  }
  const cashIdList = [...cashIds];

  // Kas awal: saldo akun kas sebelum `from`.
  const begin = tx
    .select({ v: sql<number>`COALESCE(SUM(${journalLines.debitCents} - ${journalLines.creditCents}), 0)` })
    .from(journalLines)
    .innerJoin(journals, eq(journalLines.journalId, journals.id))
    .where(and(eq(journalLines.orgId, orgId), inArray(journalLines.accountId, cashIdList), lt(journals.date, from)))
    .get();
  const beginningCents = Number(begin?.v ?? 0);

  // Baris dalam rentang + meta akun, untuk klasifikasi.
  const rows = tx
    .select({
      journalId: journals.id,
      accountId: journalLines.accountId,
      type: accounts.type,
      subtype: accounts.subtype,
      debit: journalLines.debitCents,
      credit: journalLines.creditCents,
    })
    .from(journalLines)
    .innerJoin(journals, eq(journalLines.journalId, journals.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(eq(journalLines.orgId, orgId), gte(journals.date, from), lte(journals.date, to)))
    .all();

  // Hanya jurnal yang menyentuh kas; sumbang arus = (kredit−debit) akun LAWAN per kategori.
  const byJournal = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byJournal.get(r.journalId) ?? [];
    arr.push(r);
    byJournal.set(r.journalId, arr);
  }
  let operating = 0,
    investing = 0,
    financing = 0;
  for (const lines of byJournal.values()) {
    if (!lines.some((l) => cashIds.has(l.accountId))) continue;
    for (const l of lines) {
      if (cashIds.has(l.accountId)) continue;
      const contribution = Number(l.credit) - Number(l.debit); // dampak ke kas
      const cat = classifyCashFlow(l.type, l.subtype);
      if (cat === "operating") operating += contribution;
      else if (cat === "investing") investing += contribution;
      else financing += contribution;
    }
  }
  const netChangeCents = operating + investing + financing;
  return {
    range: { from, to },
    beginningCents,
    operatingCents: operating,
    investingCents: investing,
    financingCents: financing,
    netChangeCents,
    endingCents: beginningCents + netChangeCents,
  };
}

// Ekspor faktur penjualan ber-PPN (baris mentah; format CSV dibangun di Worker).
export function efakturExport(tx: OrgDbTx, orgId: string, from: string, to: string) {
  return tx
    .select()
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.orgId, orgId),
        isNull(salesInvoices.deletedAt),
        sql`${salesInvoices.taxCents} > 0`,
        gte(salesInvoices.date, from),
        lte(salesInvoices.date, to),
      ),
    )
    .orderBy(asc(salesInvoices.date))
    .all();
}
