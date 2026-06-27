import { Hono } from "hono";
import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import {
  salesInvoices,
  salesInvoiceLines,
  items,
  buildSalesInvoiceJournalFromLines,
  salesInvoiceCreateSchema,
  type CogsLine,
  type Item,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver, resolveTax } from "../lib/accounting.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { defaultWarehouseId, recordStockOut } from "../lib/stock.js";

const app = new Hono<AppContext>();

// Daftar faktur penjualan.
app.get("/:orgId/sales-invoices", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.orgId, orgId), isNull(salesInvoices.deletedAt)))
    .orderBy(desc(salesInvoices.date));
  return c.json(rows);
});

// Buat & posting faktur penjualan (atomik: dokumen + jurnal AR/Revenue/PPN).
app.post("/:orgId/sales-invoices", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = salesInvoiceCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Faktur tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const lines = d.lines.map((l, i) => ({ ...l, lineNo: i, amountCents: l.qty * l.unitPriceCents }));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  try {
    const invoice = await c.var.db.transaction(async (tx) => {
      const resolve = await loadResolver(tx, orgId);
      const { taxRateId, taxCents } = await resolveTax(tx, orgId, d.taxRateId, subtotalCents, d.date);
      const totalCents = subtotalCents + taxCents;
      const number = await nextDocumentNumber(tx, orgId, "sales_invoice", d.date);

      const [inv] = await tx
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
          memo: d.memo ?? null,
          createdBy: c.var.user.id,
          clientId: d.clientId ?? null,
        })
        .returning();

      await tx.insert(salesInvoiceLines).values(
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
      );

      // Pergerakan stok keluar + HPP (perpetual) untuk baris item stok.
      const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
      const cogsLines: CogsLine[] = [];
      if (itemIds.length) {
        const rows = await tx.select().from(items).where(and(eq(items.orgId, orgId), inArray(items.id, itemIds)));
        const itemMap = new Map<string, Item>(rows.map((it) => [it.id, it]));
        const whId = await defaultWarehouseId(tx, orgId);
        for (const l of lines) {
          const it = l.itemId ? itemMap.get(l.itemId) : undefined;
          if (!it || it.type !== "stock") continue;
          if (!it.inventoryAccountId || !it.cogsAccountId) throw new Error(`Item ${it.name} tanpa akun persediaan/HPP`);
          const [cur] = await tx.select().from(items).where(eq(items.id, it.id));
          const { cogsCents } = await recordStockOut(tx, cur, whId, l.qty, d.date, "sales_invoice", inv.id, l.description);
          if (cogsCents > 0) cogsLines.push({ cogsAccountId: it.cogsAccountId, inventoryAccountId: it.inventoryAccountId, amountCents: cogsCents });
        }
      }

      const draft = buildSalesInvoiceJournalFromLines({
        date: d.date,
        contactId: d.contactId,
        arAccountId: resolve("accounts_receivable"),
        revenueLines: lines.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents })),
        taxCents,
        taxOutputAccountId: taxCents > 0 ? resolve("tax_output") : null,
        cogsLines,
        sourceId: inv.id,
        memo: number,
      });
      const journalId = await insertDraftJournal(tx, orgId, draft, {
        createdBy: c.var.user.id,
        sourceId: inv.id,
        number,
      });
      await tx.update(salesInvoices).set({ journalId }).where(eq(salesInvoices.id, inv.id));
      return { ...inv, journalId };
    });
    return c.json(invoice, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
