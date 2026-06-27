import { Hono } from "hono";
import { and, eq, asc } from "drizzle-orm";
import { accountingPeriods } from "@catatpro/shared";
import { z } from "zod";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  startDate: isoDate,
  endDate: isoDate,
});
const statusSchema = z.object({ status: z.enum(["open", "closed", "locked"]) });

app.get("/:orgId/periods", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(accountingPeriods)
    .where(eq(accountingPeriods.orgId, orgId))
    .orderBy(asc(accountingPeriods.startDate));
  return c.json(rows);
});

app.post("/:orgId/periods", requireAuth, requireOrg("admin"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = periodCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Periode tidak valid", details: parsed.error.flatten() }, 400);
  const [row] = await c.var.db.insert(accountingPeriods).values({ orgId, ...parsed.data }).returning();
  return c.json(row, 201);
});

// Ubah status periode: open | closed | locked (admin/owner).
app.patch("/:orgId/periods/:periodId", requireAuth, requireOrg("admin"), async (c) => {
  const orgId = c.req.param("orgId");
  const periodId = c.req.param("periodId");
  const parsed = statusSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Status tidak valid" }, 400);
  const [row] = await c.var.db
    .update(accountingPeriods)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(accountingPeriods.orgId, orgId), eq(accountingPeriods.id, periodId)))
    .returning();
  if (!row) return c.json({ error: "Periode tidak ditemukan" }, 404);
  return c.json(row);
});

export default app;
