import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { organizations, memberships, orgCreateSchema, type OrgWithRole } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth } from "../middleware.js";
import { getControlDb } from "../d1.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar organisasi milik / yang diikuti user, beserta perannya. (D1, lintas-org.)
app.get("/", requireAuth, async (c) => {
  const db = getControlDb(c.env.CATATPRO_DB);
  const rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.userId, c.var.user.id), isNull(organizations.deletedAt)));
  const result: OrgWithRole[] = rows.map((r) => ({ ...r.org, role: r.role }));
  return c.json(result);
});

// Buat organisasi baru: insert org+membership owner di D1, lalu seed COA/gudang/
// tarif pajak default di OrgDO-nya. Dua langkah — BUKAN satu transaksi native
// (dua storage berbeda); bila seedOrg gagal, RPC lain yang menyentuh OrgDO ini
// akan seed mandiri via ensureSeeded() (lihat durable-objects/org-do.ts).
app.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = orgCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Payload tidak valid", details: parsed.error.flatten() }, 400);
  const { name, accountingStandard, baseCurrency, npwp } = parsed.data;
  const userId = c.var.user.id;

  const db = getControlDb(c.env.CATATPRO_DB);
  const [created] = await db
    .insert(organizations)
    .values({ name, ownerUserId: userId, accountingStandard, baseCurrency, npwp: npwp ?? null })
    .returning();
  await db.insert(memberships).values({ orgId: created.id, userId, role: "owner" });

  const stub = getOrgStub(c.env, created.id);
  await stub.seedOrg(created.id, { accountingStandard, baseCurrency, npwp: npwp ?? null });

  return c.json(created, 201);
});

export default app;
