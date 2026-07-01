import { Hono } from "hono";
import { itemCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

app.get("/:orgId/items", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const stub = getOrgStub(c.env, orgId);
  return c.json(await stub.listItems(orgId));
});

// Buat item; akun persediaan/HPP/pendapatan default dari COA.
app.post("/:orgId/items", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = itemCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Item tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const row = await stub.createItem(orgId, parsed.data);
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
