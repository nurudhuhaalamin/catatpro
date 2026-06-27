import { Hono } from "hono";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  payments,
  paymentAllocations,
  salesInvoices,
  purchaseBills,
  buildSettlementJournal,
  paymentCreateSchema,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver } from "../lib/accounting.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";

const app = new Hono<AppContext>();

app.get("/:orgId/payments", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), isNull(payments.deletedAt)))
    .orderBy(desc(payments.date));
  return c.json(rows);
});

const docStatus = (paid: number, total: number) => (paid >= total ? "paid" : paid > 0 ? "partial" : "posted");

// Catat pembayaran beralokasi ke banyak faktur/tagihan (atomik + jurnal pelunasan).
app.post("/:orgId/payments", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = paymentCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Pembayaran tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;

  try {
    const payment = await c.var.db.transaction(async (tx) => {
      const resolve = await loadResolver(tx, orgId);
      const number = await nextDocumentNumber(tx, orgId, "payment", d.date);

      const [pay] = await tx
        .insert(payments)
        .values({
          orgId,
          number,
          contactId: d.contactId,
          direction: d.direction,
          date: d.date,
          cashAccountId: d.cashAccountId,
          amountCents: d.amountCents,
          memo: d.memo ?? null,
          createdBy: c.var.user.id,
          clientId: d.clientId ?? null,
        })
        .returning();

      if (d.allocations.length > 0) {
        await tx.insert(paymentAllocations).values(
          d.allocations.map((a) => ({
            orgId,
            paymentId: pay.id,
            targetType: a.targetType,
            targetId: a.targetId,
            amountCents: a.amountCents,
          })),
        );

        // Perbarui paidCents & status tiap dokumen yang dialokasikan.
        for (const a of d.allocations) {
          if (a.targetType === "sales_invoice") {
            const [inv] = await tx.select().from(salesInvoices).where(and(eq(salesInvoices.orgId, orgId), eq(salesInvoices.id, a.targetId)));
            if (!inv) throw new Error("Faktur alokasi tidak ditemukan");
            const paid = inv.paidCents + a.amountCents;
            if (paid > inv.totalCents) throw new Error(`Alokasi melebihi sisa faktur ${inv.number}`);
            await tx.update(salesInvoices).set({ paidCents: paid, status: docStatus(paid, inv.totalCents) }).where(eq(salesInvoices.id, inv.id));
          } else {
            const [bill] = await tx.select().from(purchaseBills).where(and(eq(purchaseBills.orgId, orgId), eq(purchaseBills.id, a.targetId)));
            if (!bill) throw new Error("Tagihan alokasi tidak ditemukan");
            const paid = bill.paidCents + a.amountCents;
            if (paid > bill.totalCents) throw new Error(`Alokasi melebihi sisa tagihan ${bill.number}`);
            await tx.update(purchaseBills).set({ paidCents: paid, status: docStatus(paid, bill.totalCents) }).where(eq(purchaseBills.id, bill.id));
          }
        }
      }

      const draft = buildSettlementJournal({
        date: d.date,
        kind: d.direction,
        cashAccountId: d.cashAccountId,
        contactAccountId: d.direction === "receive" ? resolve("accounts_receivable") : resolve("accounts_payable"),
        contactId: d.contactId,
        amountCents: d.amountCents,
        sourceId: pay.id,
        memo: number,
      });
      const journalId = await insertDraftJournal(tx, orgId, draft, { createdBy: c.var.user.id, sourceId: pay.id, number });
      await tx.update(payments).set({ journalId }).where(eq(payments.id, pay.id));
      return { ...pay, journalId };
    });
    return c.json(payment, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
