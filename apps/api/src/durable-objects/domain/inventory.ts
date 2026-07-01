import { and, eq, isNull, asc } from "drizzle-orm";
import { items, stockMoves, stockValue, buildManualJournal, debit, credit, type StockAdjustment } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { defaultWarehouseId, recordStockIn, recordStockOut } from "../lib/stock.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

// Penyesuaian / stok awal: stock_move + jurnal (Persediaan vs akun offset).
export function recordStockAdjustment(tx: OrgDbTx, orgId: string, d: StockAdjustment, userId: string) {
  assertPeriodOpen(tx, orgId, d.date);
  const item = tx.select().from(items).where(and(eq(items.orgId, orgId), eq(items.id, d.itemId))).get();
  if (!item) throw new Error("Item tidak ditemukan");
  if (item.type !== "stock") throw new Error("Hanya item stok yang punya persediaan");
  if (!item.inventoryAccountId) throw new Error("Item tanpa akun persediaan");
  const whId = defaultWarehouseId(tx, orgId);

  let valueCents: number;
  let lines;
  if (d.qtyDelta > 0) {
    const r = recordStockIn(tx, item, whId, d.qtyDelta, d.unitCostCents, d.date, "adjustment", null, d.memo);
    valueCents = r.valueCents;
    lines = [...debit(item.inventoryAccountId, valueCents), ...credit(d.offsetAccountId, valueCents)];
  } else {
    const r = recordStockOut(tx, item, whId, -d.qtyDelta, d.date, "adjustment", null, d.memo);
    valueCents = r.cogsCents;
    lines = [...debit(d.offsetAccountId, valueCents), ...credit(item.inventoryAccountId, valueCents)];
  }
  if (valueCents > 0) {
    const draft = buildManualJournal(d.date, lines, d.memo ?? "Penyesuaian stok");
    insertDraftJournal(tx, orgId, draft, { createdBy: userId });
  }
  return { ok: true, valueCents };
}

export function stockValuation(tx: OrgDbTx, orgId: string) {
  const rows = tx
    .select()
    .from(items)
    .where(and(eq(items.orgId, orgId), eq(items.type, "stock"), isNull(items.deletedAt)))
    .orderBy(asc(items.name))
    .all();
  const data = rows.map((i) => ({
    itemId: i.id,
    name: i.name,
    qtyOnHand: i.qtyOnHand,
    avgCostCents: i.avgCostCents,
    valueCents: stockValue(i.qtyOnHand, i.avgCostCents),
  }));
  return { rows: data, totalCents: data.reduce((s, r) => s + r.valueCents, 0) };
}

export function stockCard(tx: OrgDbTx, orgId: string, itemId: string) {
  const rows = tx.select().from(stockMoves).where(and(eq(stockMoves.orgId, orgId), eq(stockMoves.itemId, itemId))).orderBy(asc(stockMoves.date)).all();
  let qty = 0;
  const data = rows.map((m) => {
    qty += m.qtyDelta;
    return { date: m.date, qtyDelta: m.qtyDelta, unitCostCents: m.unitCostCents, valueCents: m.valueCents, sourceType: m.sourceType, runningQty: qty };
  });
  return { itemId, rows: data };
}
