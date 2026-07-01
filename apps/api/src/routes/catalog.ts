import { Hono } from "hono";
import { exchangeRateCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar akun (COA) org — untuk pemilihan akun di form.
app.get("/:orgId/accounts", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listAccounts(orgId));
});

// Daftar tarif pajak aktif.
app.get("/:orgId/tax-rates", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listTaxRates(orgId));
});

// Kurs: daftar (terbaru per mata uang dulu) & tambah.
app.get("/:orgId/exchange-rates", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listExchangeRates(orgId));
});

app.post("/:orgId/exchange-rates", requireAuth, requireOrg("admin"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = exchangeRateCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Kurs tidak valid", details: parsed.error.flatten() }, 400);
  const row = await getOrgStub(c.env, orgId).addExchangeRate(orgId, parsed.data);
  return c.json(row, 201);
});

export default app;
