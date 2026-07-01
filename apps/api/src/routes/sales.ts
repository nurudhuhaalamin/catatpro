import { Hono } from "hono";
import { salesInvoiceCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar faktur penjualan.
app.get("/:orgId/sales-invoices", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listSalesInvoices(orgId));
});

// Buat & posting faktur penjualan (atomik: dokumen + jurnal AR/Revenue/PPN).
app.post("/:orgId/sales-invoices", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = salesInvoiceCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Faktur tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const invoice = await stub.createSalesInvoice(orgId, parsed.data, c.var.user.id);
    return c.json(invoice, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
