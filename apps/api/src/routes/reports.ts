import { Hono } from "hono";
import { and, eq, isNull, ne, sql, asc } from "drizzle-orm";
import {
  accounts,
  journals,
  journalLines,
  salesInvoices,
  purchaseBills,
  agingBuckets,
  type AgingDoc,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

// Saldo per akun (debit, credit) dari buku besar — dasar semua laporan.
async function accountBalances(db: AppContext["Variables"]["db"], orgId: string) {
  const rows = await db
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
    .orderBy(asc(accounts.code));
  return rows.map((r) => ({
    ...r,
    debitCents: Number(r.debitCents),
    creditCents: Number(r.creditCents),
    balanceCents: Number(r.debitCents) - Number(r.creditCents),
  }));
}

// Neraca Saldo.
app.get("/:orgId/reports/trial-balance", requireAuth, requireOrg("viewer"), async (c) => {
  const rows = await accountBalances(c.var.db, c.req.param("orgId"));
  const totalDebit = rows.reduce((s, r) => s + r.debitCents, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditCents, 0);
  return c.json({ rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit });
});

// Laba Rugi (akrual): pendapatan − beban.
app.get("/:orgId/reports/income-statement", requireAuth, requireOrg("viewer"), async (c) => {
  const rows = await accountBalances(c.var.db, c.req.param("orgId"));
  const income = rows.filter((r) => r.type === "income").map((r) => ({ ...r, amountCents: r.creditCents - r.debitCents }));
  const expense = rows.filter((r) => r.type === "expense").map((r) => ({ ...r, amountCents: r.debitCents - r.creditCents }));
  const totalIncome = income.reduce((s, r) => s + r.amountCents, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amountCents, 0);
  return c.json({ income, expense, totalIncome, totalExpense, netIncomeCents: totalIncome - totalExpense });
});

// Neraca: aset = liabilitas + ekuitas (+ laba berjalan).
app.get("/:orgId/reports/balance-sheet", requireAuth, requireOrg("viewer"), async (c) => {
  const rows = await accountBalances(c.var.db, c.req.param("orgId"));
  const assets = rows.filter((r) => r.type === "asset").map((r) => ({ ...r, amountCents: r.balanceCents }));
  const liabilities = rows.filter((r) => r.type === "liability").map((r) => ({ ...r, amountCents: -r.balanceCents }));
  const equity = rows.filter((r) => r.type === "equity").map((r) => ({ ...r, amountCents: -r.balanceCents }));
  const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s - r.balanceCents, 0);
  const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.balanceCents, 0);
  const netIncomeCents = totalIncome - totalExpense;

  const totalAssets = assets.reduce((s, r) => s + r.amountCents, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amountCents, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amountCents, 0) + netIncomeCents;
  return c.json({
    assets,
    liabilities,
    equity,
    netIncomeCents,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  });
});

// Buku Besar per akun.
app.get("/:orgId/reports/ledger", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const accountId = c.req.query("accountId");
  if (!accountId) return c.json({ error: "accountId wajib" }, 400);
  const rows = await c.var.db
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
    .orderBy(asc(journals.date));
  let running = 0;
  const data = rows.map((r) => {
    running += Number(r.debitCents) - Number(r.creditCents);
    return { ...r, debitCents: Number(r.debitCents), creditCents: Number(r.creditCents), balanceCents: running };
  });
  return c.json({ accountId, rows: data });
});

// Aging Piutang (AR) / Hutang (AP).
async function aging(db: AppContext["Variables"]["db"], orgId: string, kind: "ar" | "ap", asOf: string) {
  const table = kind === "ar" ? salesInvoices : purchaseBills;
  const rows = await db
    .select({ date: table.date, dueDate: table.dueDate, totalCents: table.totalCents, paidCents: table.paidCents })
    .from(table)
    .where(and(eq(table.orgId, orgId), isNull(table.deletedAt), ne(table.status, "paid")));
  const docs: AgingDoc[] = rows.map((r) => ({
    date: r.date,
    dueDate: r.dueDate,
    outstandingCents: Number(r.totalCents) - Number(r.paidCents),
  }));
  return agingBuckets(docs, asOf);
}

app.get("/:orgId/reports/ar-aging", requireAuth, requireOrg("viewer"), async (c) => {
  const asOf = c.req.query("asOf") ?? new Date().toISOString().slice(0, 10);
  return c.json(await aging(c.var.db, c.req.param("orgId"), "ar", asOf));
});
app.get("/:orgId/reports/ap-aging", requireAuth, requireOrg("viewer"), async (c) => {
  const asOf = c.req.query("asOf") ?? new Date().toISOString().slice(0, 10);
  return c.json(await aging(c.var.db, c.req.param("orgId"), "ap", asOf));
});

export default app;
