import { Hono } from "hono";
import { purchaseBillCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar tagihan pembelian.
app.get("/:orgId/purchase-bills", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listPurchaseBills(orgId));
});

// Buat & posting tagihan pembelian (atomik: dokumen + jurnal AP/Inventory|Expense/PPN masukan).
app.post("/:orgId/purchase-bills", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = purchaseBillCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Tagihan tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const bill = await stub.createPurchaseBill(orgId, parsed.data, c.var.user.id);
    return c.json(bill, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
