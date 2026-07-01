import { and, eq, isNull, asc } from "drizzle-orm";
import { items, type ItemCreate } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { loadResolver } from "../lib/accounting.js";

export function listItems(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(items)
    .where(and(eq(items.orgId, orgId), isNull(items.deletedAt)))
    .orderBy(asc(items.name))
    .all();
}

// Buat item; akun persediaan/HPP/pendapatan default dari COA.
export function createItem(tx: OrgDbTx, orgId: string, d: ItemCreate) {
  const resolve = loadResolver(tx, orgId);
  const isStock = d.type === "stock";
  return tx
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
    .returning()
    .get();
}
