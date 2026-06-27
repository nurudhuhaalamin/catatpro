import { Hono } from "hono";
import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import {
  purchaseBills,
  purchaseBillLines,
  contacts,
  items,
  buildPurchaseBillJournalFromLines,
  purchaseBillCreateSchema,
  type Item,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver, resolveTax } from "../lib/accounting.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { defaultWarehouseId, recordStockIn } from "../lib/stock.js";
import { assertPeriodOpen } from "../lib/period.js";

const app = new Hono<AppContext>();

// Daftar tagihan pembelian.
app.get("/:orgId/purchase-bills", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.orgId, orgId), isNull(purchaseBills.deletedAt)))
    .orderBy(desc(purchaseBills.date));
  return c.json(rows);
});

// Buat & posting tagihan pembelian (atomik: dokumen + jurnal AP/Inventory|Expense/PPN masukan).
app.post("/:orgId/purchase-bills", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = purchaseBillCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Tagihan tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const lines = d.lines.map((l, i) => ({ ...l, lineNo: i, amountCents: l.qty * l.unitPriceCents }));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  try {
    const bill = await c.var.db.transaction(async (tx) => {
      await assertPeriodOpen(tx, orgId, d.date);
      const resolve = await loadResolver(tx, orgId);
      const { taxRateId, taxCents } = await resolveTax(tx, orgId, d.taxRateId, subtotalCents, d.date);
      const totalCents = subtotalCents + taxCents;
      const number = await nextDocumentNumber(tx, orgId, "purchase_bill", d.date);
      const [contact] = await tx.select({ npwp: contacts.npwp }).from(contacts).where(eq(contacts.id, d.contactId));

      // Muat item yang dirujuk baris (untuk akun persediaan & pergerakan stok).
      const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
      const itemMap = new Map<string, Item>();
      if (itemIds.length) {
        const rows = await tx.select().from(items).where(and(eq(items.orgId, orgId), inArray(items.id, itemIds)));
        for (const it of rows) itemMap.set(it.id, it);
      }
      // Untuk baris item stok: gunakan akun persediaan item sebagai akun debet.
      const effLines = lines.map((l) => {
        const it = l.itemId ? itemMap.get(l.itemId) : undefined;
        const accountId = it && it.type === "stock" && it.inventoryAccountId ? it.inventoryAccountId : l.accountId;
        return { ...l, accountId };
      });

      const [b] = await tx
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
          taxCode: d.taxCode ?? null,
          counterpartyNpwp: d.counterpartyNpwp ?? contact?.npwp ?? null,
          memo: d.memo ?? null,
          createdBy: c.var.user.id,
          clientId: d.clientId ?? null,
        })
        .returning();

      await tx.insert(purchaseBillLines).values(
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
      );

      // Pergerakan stok masuk + perbarui biaya rata-rata untuk baris item stok.
      const stockLines = effLines.filter((l) => {
        const it = l.itemId ? itemMap.get(l.itemId) : undefined;
        return it && it.type === "stock";
      });
      if (stockLines.length) {
        const whId = await defaultWarehouseId(tx, orgId);
        for (const l of stockLines) {
          const it = itemMap.get(l.itemId!)!;
          // refresh agar rata-rata berurutan benar bila item sama muncul >1 baris
          const [cur] = await tx.select().from(items).where(eq(items.id, it.id));
          await recordStockIn(tx, cur, whId, l.qty, l.unitPriceCents, d.date, "purchase_bill", b.id, l.description);
        }
      }

      const draft = buildPurchaseBillJournalFromLines({
        date: d.date,
        contactId: d.contactId,
        apAccountId: resolve("accounts_payable"),
        debitLines: effLines.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents })),
        taxCents,
        taxInputAccountId: taxCents > 0 ? resolve("tax_input") : null,
        sourceId: b.id,
        memo: number,
      });
      const journalId = await insertDraftJournal(tx, orgId, draft, {
        createdBy: c.var.user.id,
        sourceId: b.id,
        number,
      });
      await tx.update(purchaseBills).set({ journalId }).where(eq(purchaseBills.id, b.id));
      return { ...b, journalId };
    });
    return c.json(bill, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
