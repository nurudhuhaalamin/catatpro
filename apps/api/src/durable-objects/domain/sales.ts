import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import {
  salesInvoices,
  salesInvoiceLines,
  contacts,
  items,
  buildSalesInvoiceJournalFromLines,
  convertToBase,
  type CogsLine,
  type Item,
  type SalesInvoiceCreate,
} from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { loadResolver, resolveTax } from "../lib/accounting.js";
import { resolveRate } from "../lib/forex.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { defaultWarehouseId, recordStockOut } from "../lib/stock.js";
import { assertPeriodOpen } from "../lib/period.js";

export function listSalesInvoices(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.orgId, orgId), isNull(salesInvoices.deletedAt)))
    .orderBy(desc(salesInvoices.date))
    .all();
}

// Buat & posting faktur penjualan (atomik: dokumen + jurnal AR/Revenue/PPN).
export function createSalesInvoice(tx: OrgDbTx, orgId: string, d: SalesInvoiceCreate, userId: string) {
  const lines = d.lines.map((l, i) => ({ ...l, lineNo: i, amountCents: l.qty * l.unitPriceCents }));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  assertPeriodOpen(tx, orgId, d.date);
  const resolve = loadResolver(tx, orgId);
  const { currency, rateMicros } = resolveRate(tx, orgId, d.currency, d.date, d.rateMicros);
  const { taxRateId, taxCents } = resolveTax(tx, orgId, d.taxRateId, subtotalCents, d.date);
  const totalCents = subtotalCents + taxCents;
  const number = nextDocumentNumber(tx, orgId, "sales_invoice", d.date);
  const contact = tx.select({ npwp: contacts.npwp }).from(contacts).where(eq(contacts.id, d.contactId)).get();

  const inv = tx
    .insert(salesInvoices)
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

  tx.insert(salesInvoiceLines)
    .values(
      lines.map((l) => ({
        orgId,
        invoiceId: inv.id,
        lineNo: l.lineNo,
        description: l.description,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        amountCents: l.amountCents,
        revenueAccountId: l.accountId,
      })),
    )
    .run();

  // Pergerakan stok keluar + HPP (perpetual) untuk baris item stok.
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  const cogsLines: CogsLine[] = [];
  if (itemIds.length) {
    const rows = tx.select().from(items).where(and(eq(items.orgId, orgId), inArray(items.id, itemIds))).all();
    const itemMap = new Map<string, Item>(rows.map((it) => [it.id, it]));
    const whId = defaultWarehouseId(tx, orgId);
    for (const l of lines) {
      const it = l.itemId ? itemMap.get(l.itemId) : undefined;
      if (!it || it.type !== "stock") continue;
      if (!it.inventoryAccountId || !it.cogsAccountId) throw new Error(`Item ${it.name} tanpa akun persediaan/HPP`);
      const cur = tx.select().from(items).where(eq(items.id, it.id)).get()!;
      const { cogsCents } = recordStockOut(tx, cur, whId, l.qty, d.date, "sales_invoice", inv.id, l.description);
      if (cogsCents > 0) cogsLines.push({ cogsAccountId: it.cogsAccountId, inventoryAccountId: it.inventoryAccountId, amountCents: cogsCents });
    }
  }

  const draft = buildSalesInvoiceJournalFromLines({
    date: d.date,
    contactId: d.contactId,
    arAccountId: resolve("accounts_receivable"),
    // jurnal selalu mata uang dasar → konversi nilai dokumen via kurs
    revenueLines: lines.map((l) => ({ accountId: l.accountId, amountCents: convertToBase(l.amountCents, rateMicros) })),
    taxCents: convertToBase(taxCents, rateMicros),
    taxOutputAccountId: taxCents > 0 ? resolve("tax_output") : null,
    cogsLines,
    sourceId: inv.id,
    memo: number,
  });
  const journalId = insertDraftJournal(tx, orgId, draft, {
    createdBy: userId,
    sourceId: inv.id,
    number,
  });
  tx.update(salesInvoices).set({ journalId }).where(eq(salesInvoices.id, inv.id)).run();
  return { ...inv, journalId };
}
