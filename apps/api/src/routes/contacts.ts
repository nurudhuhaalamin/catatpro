import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { contacts, contactCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

// Daftar kontak (mitra) org.
app.get("/:orgId/contacts", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .orderBy(contacts.name);
  return c.json(rows);
});

// Buat kontak.
app.post("/:orgId/contacts", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = contactCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Data kontak tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const [row] = await c.var.db
    .insert(contacts)
    .values({
      orgId,
      name: d.name,
      type: d.type,
      email: d.email || null,
      phone: d.phone ?? null,
      npwp: d.npwp ?? null,
      address: d.address ?? null,
      note: d.note ?? null,
    })
    .returning();
  return c.json(row, 201);
});

export default app;
