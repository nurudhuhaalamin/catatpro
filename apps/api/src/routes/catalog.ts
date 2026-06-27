import { Hono } from "hono";
import { and, eq, isNull, asc } from "drizzle-orm";
import { accounts, taxRates } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

// Daftar akun (COA) org — untuk pemilihan akun di form.
app.get("/:orgId/accounts", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), isNull(accounts.deletedAt)))
    .orderBy(asc(accounts.code));
  return c.json(rows);
});

// Daftar tarif pajak aktif.
app.get("/:orgId/tax-rates", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.orgId, orgId), eq(taxRates.isActive, true)));
  return c.json(rows);
});

export default app;
