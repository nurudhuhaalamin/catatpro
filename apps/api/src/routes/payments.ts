import { Hono } from "hono";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  payments,
  paymentAllocations,
  salesInvoices,
  purchaseBills,
  buildFxSettlementJournal,
  fxOnSettlement,
  paymentCreateSchema,
  type FxAllocation,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { loadResolver } from "../lib/accounting.js";
import { resolveRate } from "../lib/forex.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

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

// Catat pembayaran beralokasi ke banyak faktur/tagihan (atomik + jurnal pelunasan + selisih kurs).
// Nilai alokasi & amountCents dalam MATA UANG dokumen; buku besar diposting di mata uang dasar.
app.post("/:orgId/payments", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = paymentCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Pembayaran tidak valid", details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  if (d.allocations.length === 0) return c.json({ error: "Alokasi ke dokumen wajib diisi" }, 400);

  try {
    const payment = await c.var.db.transaction(async (tx) => {
      await assertPeriodOpen(tx, orgId, d.date);
      const resolve = await loadResolver(tx, orgId);
      const { currency, rateMicros: payRate } = await resolveRate(tx, orgId, d.currency, d.date, d.rateMicros);
      const number = await nextDocumentNumber(tx, orgId, "payment", d.date);

      // Terapkan alokasi ke dokumen + kumpulkan info FX (kurs dokumen).
      const fxAllocs: FxAllocation[] = [];
      for (const a of d.allocations) {
        if (a.targetType === "sales_invoice") {
          const [inv] = await tx.select().from(salesInvoices).where(and(eq(salesInvoices.orgId, orgId), eq(salesInvoices.id, a.targetId)));
          if (!inv) throw new Error("Faktur alokasi tidak ditemukan");
          if (inv.currency !== currency) throw new Error(`Mata uang pembayaran (${currency}) ≠ faktur ${inv.number} (${inv.currency})`);
          const paid = inv.paidCents + a.amountCents;
          if (paid > inv.totalCents) throw new Error(`Alokasi melebihi sisa faktur ${inv.number}`);
          await tx.update(salesInvoices).set({ paidCents: paid, status: docStatus(paid, inv.totalCents) }).where(eq(salesInvoices.id, inv.id));
          fxAllocs.push({ foreignCents: a.amountCents, docRateMicros: inv.rateMicros });
        } else {
          const [bill] = await tx.select().from(purchaseBills).where(and(eq(purchaseBills.orgId, orgId), eq(purchaseBills.id, a.targetId)));
          if (!bill) throw new Error("Tagihan alokasi tidak ditemukan");
          if (bill.currency !== currency) throw new Error(`Mata uang pembayaran (${currency}) ≠ tagihan ${bill.number} (${bill.currency})`);
          const paid = bill.paidCents + a.amountCents;
          if (paid > bill.totalCents) throw new Error(`Alokasi melebihi sisa tagihan ${bill.number}`);
          await tx.update(purchaseBills).set({ paidCents: paid, status: docStatus(paid, bill.totalCents) }).where(eq(purchaseBills.id, bill.id));
          fxAllocs.push({ foreignCents: a.amountCents, docRateMicros: bill.rateMicros });
        }
      }

      const amountForeign = d.allocations.reduce((s, a) => s + a.amountCents, 0);
      const [pay] = await tx
        .insert(payments)
        .values({
          orgId,
          number,
          contactId: d.contactId,
          direction: d.direction,
          date: d.date,
          cashAccountId: d.cashAccountId,
          amountCents: amountForeign,
          currency,
          rateMicros: payRate,
          memo: d.memo ?? null,
          createdBy: c.var.user.id,
          clientId: d.clientId ?? null,
        })
        .returning();

      await tx.insert(paymentAllocations).values(
        d.allocations.map((a) => ({ orgId, paymentId: pay.id, targetType: a.targetType, targetId: a.targetId, amountCents: a.amountCents })),
      );

      const fx = fxOnSettlement(d.direction, fxAllocs, payRate);
      const draft = buildFxSettlementJournal({
        date: d.date,
        kind: d.direction,
        cashAccountId: d.cashAccountId,
        contactAccountId: d.direction === "receive" ? resolve("accounts_receivable") : resolve("accounts_payable"),
        contactId: d.contactId,
        cashBaseCents: fx.cashBaseCents,
        counterBaseCents: fx.counterBaseCents,
        fxGainCents: fx.fxGainCents,
        fxGainAccountId: resolve("fx_gain"),
        fxLossAccountId: resolve("fx_loss"),
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
