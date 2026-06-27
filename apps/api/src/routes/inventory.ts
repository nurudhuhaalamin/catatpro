import { Hono } from "hono";
import { and, eq, isNull, asc } from "drizzle-orm";
import { items, stockMoves, stockValue, buildManualJournal, debit, credit, stockAdjustmentSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { defaultWarehouseId, recordStockIn, recordStockOut } from "../lib/stock.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

const app = new Hono<AppContext>();

// Penyesuaian / stok awal: stock_move + jurnal (Persediaan vs akun offset).
app.post("/:orgId/inventory/adjustments", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Penyesuaian tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  try {
    const result = await c.var.db.transaction(async (tx) => {
      await assertPeriodOpen(tx, orgId, d.date);
      const [item] = await tx.select().from(items).where(and(eq(items.orgId, orgId), eq(items.id, d.itemId)));
      if (!item) throw new Error("Item tidak ditemukan");
      if (item.type !== "stock") throw new Error("Hanya item stok yang punya persediaan");
      if (!item.inventoryAccountId) throw new Error("Item tanpa akun persediaan");
      const whId = await defaultWarehouseId(tx, orgId);

      let valueCents: number;
      let lines;
      if (d.qtyDelta > 0) {
        const r = await recordStockIn(tx, item, whId, d.qtyDelta, d.unitCostCents, d.date, "adjustment", null, d.memo);
        valueCents = r.valueCents;
        lines = [...debit(item.inventoryAccountId, valueCents), ...credit(d.offsetAccountId, valueCents)];
      } else {
        const r = await recordStockOut(tx, item, whId, -d.qtyDelta, d.date, "adjustment", null, d.memo);
        valueCents = r.cogsCents;
        lines = [...debit(d.offsetAccountId, valueCents), ...credit(item.inventoryAccountId, valueCents)];
      }
      if (valueCents > 0) {
        const draft = buildManualJournal(d.date, lines, d.memo ?? "Penyesuaian stok");
        await insertDraftJournal(tx, orgId, draft, { createdBy: c.var.user.id });
      }
      return { ok: true, valueCents };
    });
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Laporan valuasi persediaan.
app.get("/:orgId/inventory/valuation", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(items)
    .where(and(eq(items.orgId, orgId), eq(items.type, "stock"), isNull(items.deletedAt)))
    .orderBy(asc(items.name));
  const data = rows.map((i) => ({
    itemId: i.id,
    name: i.name,
    qtyOnHand: i.qtyOnHand,
    avgCostCents: i.avgCostCents,
    valueCents: stockValue(i.qtyOnHand, i.avgCostCents),
  }));
  return c.json({ rows: data, totalCents: data.reduce((s, r) => s + r.valueCents, 0) });
});

// Kartu stok per item.
app.get("/:orgId/inventory/stock-card", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const itemId = c.req.query("itemId");
  if (!itemId) return c.json({ error: "itemId wajib" }, 400);
  const rows = await c.var.db
    .select()
    .from(stockMoves)
    .where(and(eq(stockMoves.orgId, orgId), eq(stockMoves.itemId, itemId)))
    .orderBy(asc(stockMoves.date));
  let qty = 0;
  const data = rows.map((m) => {
    qty += m.qtyDelta;
    return { date: m.date, qtyDelta: m.qtyDelta, unitCostCents: m.unitCostCents, valueCents: m.valueCents, sourceType: m.sourceType, runningQty: qty };
  });
  return c.json({ itemId, rows: data });
});

export default app;
