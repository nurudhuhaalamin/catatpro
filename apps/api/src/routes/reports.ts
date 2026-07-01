import { Hono } from "hono";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Neraca Saldo.
app.get("/:orgId/reports/trial-balance", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).trialBalance(orgId));
});

// Laba Rugi (akrual): pendapatan − beban.
app.get("/:orgId/reports/income-statement", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).incomeStatement(orgId));
});

// Neraca: aset = liabilitas + ekuitas (+ laba berjalan).
app.get("/:orgId/reports/balance-sheet", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).balanceSheet(orgId));
});

// Buku Besar per akun.
app.get("/:orgId/reports/ledger", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const accountId = c.req.query("accountId");
  if (!accountId) return c.json({ error: "accountId wajib" }, 400);
  return c.json(await getOrgStub(c.env, orgId).ledger(orgId, accountId));
});

// Aging Piutang (AR) / Hutang (AP).
app.get("/:orgId/reports/ar-aging", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const asOf = c.req.query("asOf") ?? new Date().toISOString().slice(0, 10);
  return c.json(await getOrgStub(c.env, orgId).arAging(orgId, asOf));
});
app.get("/:orgId/reports/ap-aging", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const asOf = c.req.query("asOf") ?? new Date().toISOString().slice(0, 10);
  return c.json(await getOrgStub(c.env, orgId).apAging(orgId, asOf));
});

const rangeOf = (c: { req: { query: (k: string) => string | undefined } }) => ({
  from: c.req.query("from") ?? "1900-01-01",
  to: c.req.query("to") ?? "9999-12-31",
});

// Ringkasan PPN: keluaran (penjualan) − masukan (pembelian) = PPN terutang.
app.get("/:orgId/reports/tax-summary", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const { from, to } = rangeOf(c);
  return c.json(await getOrgStub(c.env, orgId).taxSummary(orgId, from, to));
});

// Arus Kas (metode langsung): klasifikasi pergerakan akun kas/bank.
app.get("/:orgId/reports/cash-flow", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const { from, to } = rangeOf(c);
  return c.json(await getOrgStub(c.env, orgId).cashFlow(orgId, from, to));
});

export default app;
