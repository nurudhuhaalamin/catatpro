import { Hono } from "hono";
import { paymentCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

app.get("/:orgId/payments", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listPayments(orgId));
});

// Catat pembayaran beralokasi ke banyak faktur/tagihan (atomik + jurnal pelunasan + selisih kurs).
// Nilai alokasi & amountCents dalam MATA UANG dokumen; buku besar diposting di mata uang dasar.
app.post("/:orgId/payments", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = paymentCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Pembayaran tidak valid", details: parsed.error.flatten() }, 400);
  if (parsed.data.allocations.length === 0) return c.json({ error: "Alokasi ke dokumen wajib diisi" }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const payment = await stub.createPayment(orgId, parsed.data, c.var.user.id);
    return c.json(payment, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
