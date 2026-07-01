import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import {
  purchaseBills,
  purchaseBillLines,
  contacts,
  items,
  buildPurchaseBillJournalFromLines,
  convertToBase,
  type Item,
  type PurchaseBillCreate,
} from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { loadResolver, resolveTax } from "../lib/accounting.js";
import { resolveRate } from "../lib/forex.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { defaultWarehouseId, recordStockIn } from "../lib/stock.js";
import { assertPeriodOpen } from "../lib/period.js";

export function listPurchaseBills(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.orgId, orgId), isNull(purchaseBills.deletedAt)))
    .orderBy(desc(purchaseBills.date))
    .all();
}

// Buat & posting tagihan pembelian (atomik: dokumen + jurnal AP/Inventory|Expense/PPN masukan).
export function createPurchaseBill(tx: OrgDbTx, orgId: string, d: PurchaseBillCreate, userId: string) {
  const lines = d.lines.map((l, i) => ({ ...l, lineNo: i, amountCents: l.qty * l.unitPriceCents }));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  assertPeriodOpen(tx, orgId, d.date);
  const resolve = loadResolver(tx, orgId);
  const { currency, rateMicros } = resolveRate(tx, orgId, d.currency, d.date, d.rateMicros);
  const { taxRateId, taxCents } = resolveTax(tx, orgId, d.taxRateId, subtotalCents, d.date);
  const totalCents = subtotalCents + taxCents;
  const number = nextDocumentNumber(tx, orgId, "purchase_bill", d.date);
  const contact = tx.select({ npwp: contacts.npwp }).from(contacts).where(eq(contacts.id, d.contactId)).get();

  // Muat item yang dirujuk baris (untuk akun persediaan & pergerakan stok).
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  const itemMap = new Map<string, Item>();
  if (itemIds.length) {
    const rows = tx.select().from(items).where(and(eq(items.orgId, orgId), inArray(items.id, itemIds))).all();
    for (const it of rows) itemMap.set(it.id, it);
  }
  // Untuk baris item stok: gunakan akun persediaan item sebagai akun debet.
  const effLines = lines.map((l) => {
    const it = l.itemId ? itemMap.get(l.itemId) : undefined;
    const accountId = it && it.type === "stock" && it.inventoryAccountId ? it.inventoryAccountId : l.accountId;
    return { ...l, accountId };
  });

  const b = tx
    .insert(purchaseBills)
    .values({
      orgId,
      number,
      contactId: d.contactId,
      date: d.date,
      dueDate: d.dueDate ?? null,
      status: "posted",
      subtotalCents,
      taxCents,
      totalCents,
      paidCents: 0,
      taxRateId,
      currency,
      rateMicros,
      taxCode: d.taxCode ?? null,
      counterpartyNpwp: d.counterpartyNpwp ?? contact?.npwp ?? null,
      memo: d.memo ?? null,
      createdBy: userId,
      clientId: d.clientId ?? null,
    })
    .returning()
    .get();

  tx.insert(purchaseBillLines)
    .values(
      effLines.map((l) => ({
        orgId,
        billId: b.id,
        lineNo: l.lineNo,
        description: l.description,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        amountCents: l.amountCents,
        debitAccountId: l.accountId,
      })),
    )
    .run();

  // Pergerakan stok masuk + perbarui biaya rata-rata untuk baris item stok.
  const stockLines = effLines.filter((l) => {
    const it = l.itemId ? itemMap.get(l.itemId) : undefined;
    return it && it.type === "stock";
  });
  if (stockLines.length) {
    const whId = defaultWarehouseId(tx, orgId);
    for (const l of stockLines) {
      const it = itemMap.get(l.itemId!)!;
      // refresh agar rata-rata berurutan benar bila item sama muncul >1 baris
      const cur = tx.select().from(items).where(eq(items.id, it.id)).get()!;
      // biaya persediaan dicatat dalam mata uang dasar
      recordStockIn(tx, cur, whId, l.qty, convertToBase(l.unitPriceCents, rateMicros), d.date, "purchase_bill", b.id, l.description);
    }
  }

  const draft = buildPurchaseBillJournalFromLines({
    date: d.date,
    contactId: d.contactId,
    apAccountId: resolve("accounts_payable"),
    debitLines: effLines.map((l) => ({ accountId: l.accountId, amountCents: convertToBase(l.amountCents, rateMicros) })),
    taxCents: convertToBase(taxCents, rateMicros),
    taxInputAccountId: taxCents > 0 ? resolve("tax_input") : null,
    sourceId: b.id,
    memo: number,
  });
  const journalId = insertDraftJournal(tx, orgId, draft, {
    createdBy: userId,
    sourceId: b.id,
    number,
  });
  tx.update(purchaseBills).set({ journalId }).where(eq(purchaseBills.id, b.id)).run();
  return { ...b, journalId };
}
