import { Hono } from "hono";
import { stockAdjustmentSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Penyesuaian / stok awal: stock_move + jurnal (Persediaan vs akun offset).
app.post("/:orgId/inventory/adjustments", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Penyesuaian tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const result = await stub.recordStockAdjustment(orgId, parsed.data, c.var.user.id);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Laporan valuasi persediaan.
app.get("/:orgId/inventory/valuation", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).stockValuation(orgId));
});

// Kartu stok per item.
app.get("/:orgId/inventory/stock-card", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const itemId = c.req.query("itemId");
  if (!itemId) return c.json({ error: "itemId wajib" }, 400);
  return c.json(await getOrgStub(c.env, orgId).stockCard(orgId, itemId));
});

export default app;
