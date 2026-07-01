import { Hono } from "hono";
import { contactCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar kontak (mitra) org.
app.get("/:orgId/contacts", requireAuth, requireOrg("viewer"), async (c) => {
  const stub = getOrgStub(c.env, c.req.param("orgId"));
  return c.json(await stub.listContacts(c.req.param("orgId")));
});

// Buat kontak.
app.post("/:orgId/contacts", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = contactCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Data kontak tidak valid", details: parsed.error.flatten() }, 400);
  const stub = getOrgStub(c.env, orgId);
  const row = await stub.createContact(orgId, parsed.data);
  return c.json(row, 201);
});

export default app;
