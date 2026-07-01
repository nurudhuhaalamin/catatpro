import { and, eq } from "drizzle-orm";
import { items, stockMoves, warehouses, movingAverage, type Item } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

type Source = "purchase_bill" | "sales_invoice" | "adjustment" | "opening";

/** Gudang default org (dibuat saat org dibuat). */
export function defaultWarehouseId(tx: OrgDbTx, orgId: string): string {
  const w = tx
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.orgId, orgId), eq(warehouses.isDefault, true)))
    .get();
  if (!w) throw new Error("Gudang default tidak ditemukan");
  return w.id;
}

/** Stok masuk: catat move (+qty) & perbarui rata-rata bergerak + qty cache. */
export function recordStockIn(
  tx: OrgDbTx,
  item: Item,
  warehouseId: string,
  qty: number,
  unitCostCents: number,
  date: string,
  sourceType: Source,
  sourceId: string | null,
  memo?: string | null,
): { valueCents: number; newAvgCents: number } {
  const newAvg = movingAverage(item.qtyOnHand, item.avgCostCents, qty, unitCostCents);
  const valueCents = qty * unitCostCents;
  tx.insert(stockMoves)
    .values({
      orgId: item.orgId,
      itemId: item.id,
      warehouseId,
      date,
      qtyDelta: qty,
      unitCostCents,
      valueCents,
      sourceType,
      sourceId,
      memo: memo ?? null,
    })
    .run();
  tx.update(items).set({ qtyOnHand: item.qtyOnHand + qty, avgCostCents: newAvg, updatedAt: new Date() }).where(eq(items.id, item.id)).run();
  return { valueCents, newAvgCents: newAvg };
}

/** Stok keluar: catat move (−qty) pakai biaya rata-rata terkini → kembalikan nilai HPP. */
export function recordStockOut(
  tx: OrgDbTx,
  item: Item,
  warehouseId: string,
  qty: number,
  date: string,
  sourceType: Source,
  sourceId: string | null,
  memo?: string | null,
): { cogsCents: number; unitCostCents: number } {
  const unitCost = item.avgCostCents;
  const cogsCents = qty * unitCost;
  tx.insert(stockMoves)
    .values({
      orgId: item.orgId,
      itemId: item.id,
      warehouseId,
      date,
      qtyDelta: -qty,
      unitCostCents: unitCost,
      valueCents: -cogsCents,
      sourceType,
      sourceId,
      memo: memo ?? null,
    })
    .run();
  tx.update(items).set({ qtyOnHand: item.qtyOnHand - qty, updatedAt: new Date() }).where(eq(items.id, item.id)).run();
  return { cogsCents, unitCostCents: unitCost };
}
