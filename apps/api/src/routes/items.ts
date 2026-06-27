import { Hono } from "hono";
import { and, eq, isNull, asc } from "drizzle-orm";
import { items, itemCreateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver } from "../lib/accounting.js";

const app = new Hono<AppContext>();

app.get("/:orgId/items", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(items)
    .where(and(eq(items.orgId, orgId), isNull(items.deletedAt)))
    .orderBy(asc(items.name));
  return c.json(rows);
});

// Buat item; akun persediaan/HPP/pendapatan default dari COA.
app.post("/:orgId/items", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = itemCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Item tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  try {
    const row = await c.var.db.transaction(async (tx) => {
      const resolve = await loadResolver(tx, orgId);
      const isStock = d.type === "stock";
      const [item] = await tx
        .insert(items)
        .values({
          orgId,
          sku: d.sku ?? null,
          name: d.name,
          type: d.type,
          unit: d.unit,
          salePriceCents: d.salePriceCents,
          inventoryAccountId: isStock ? resolve("inventory") : null,
          cogsAccountId: isStock ? resolve("cogs") : null,
          revenueAccountId: resolve("revenue"),
        })
        .returning();
      return item;
    });
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
