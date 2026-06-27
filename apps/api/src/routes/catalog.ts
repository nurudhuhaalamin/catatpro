import { Hono } from "hono";
import { and, eq, isNull, asc, desc } from "drizzle-orm";
import { accounts, taxRates, exchangeRates, exchangeRateCreateSchema } from "@catatpro/shared";
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

// Kurs: daftar (terbaru per mata uang dulu) & tambah.
app.get("/:orgId/exchange-rates", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.orgId, orgId))
    .orderBy(desc(exchangeRates.validFrom));
  return c.json(rows);
});

app.post("/:orgId/exchange-rates", requireAuth, requireOrg("admin"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = exchangeRateCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Kurs tidak valid", details: parsed.error.flatten() }, 400);
  const [row] = await c.var.db.insert(exchangeRates).values({ orgId, ...parsed.data }).returning();
  return c.json(row, 201);
});

export default app;
