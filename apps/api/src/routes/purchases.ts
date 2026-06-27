import { Hono } from "hono";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  purchaseBills,
  purchaseBillLines,
  buildPurchaseBillJournalFromLines,
  purchaseBillCreateSchema,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver, resolveTax } from "../lib/accounting.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";

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
      const resolve = await loadResolver(tx, orgId);
      const { taxRateId, taxCents } = await resolveTax(tx, orgId, d.taxRateId, subtotalCents, d.date);
      const totalCents = subtotalCents + taxCents;
      const number = await nextDocumentNumber(tx, orgId, "purchase_bill", d.date);

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
          memo: d.memo ?? null,
          createdBy: c.var.user.id,
          clientId: d.clientId ?? null,
        })
        .returning();

      await tx.insert(purchaseBillLines).values(
        lines.map((l) => ({
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

      const draft = buildPurchaseBillJournalFromLines({
        date: d.date,
        contactId: d.contactId,
        apAccountId: resolve("accounts_payable"),
        debitLines: lines.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents })),
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
