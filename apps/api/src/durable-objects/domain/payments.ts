import { and, eq, isNull, desc } from "drizzle-orm";
import {
  payments,
  paymentAllocations,
  salesInvoices,
  purchaseBills,
  buildFxSettlementJournal,
  fxOnSettlement,
  type FxAllocation,
  type PaymentCreate,
} from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { loadResolver } from "../lib/accounting.js";
import { resolveRate } from "../lib/forex.js";
import { nextDocumentNumber } from "../lib/sequences.js";
import { insertDraftJournal } from "../lib/journal.js";
import { assertPeriodOpen } from "../lib/period.js";

export function listPayments(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), isNull(payments.deletedAt)))
    .orderBy(desc(payments.date))
    .all();
}

const docStatus = (paid: number, total: number) => (paid >= total ? "paid" : paid > 0 ? "partial" : "posted");

// Catat pembayaran beralokasi ke banyak faktur/tagihan (atomik + jurnal pelunasan + selisih kurs).
// Nilai alokasi & amountCents dalam MATA UANG dokumen; buku besar diposting di mata uang dasar.
export function createPayment(tx: OrgDbTx, orgId: string, d: PaymentCreate, userId: string) {
  if (d.allocations.length === 0) throw new Error("Alokasi ke dokumen wajib diisi");

  assertPeriodOpen(tx, orgId, d.date);
  const resolve = loadResolver(tx, orgId);
  const { currency, rateMicros: payRate } = resolveRate(tx, orgId, d.currency, d.date, d.rateMicros);
  const number = nextDocumentNumber(tx, orgId, "payment", d.date);

  // Terapkan alokasi ke dokumen + kumpulkan info FX (kurs dokumen).
  const fxAllocs: FxAllocation[] = [];
  for (const a of d.allocations) {
    if (a.targetType === "sales_invoice") {
      const inv = tx.select().from(salesInvoices).where(and(eq(salesInvoices.orgId, orgId), eq(salesInvoices.id, a.targetId))).get();
      if (!inv) throw new Error("Faktur alokasi tidak ditemukan");
      if (inv.currency !== currency) throw new Error(`Mata uang pembayaran (${currency}) ≠ faktur ${inv.number} (${inv.currency})`);
      const paid = inv.paidCents + a.amountCents;
      if (paid > inv.totalCents) throw new Error(`Alokasi melebihi sisa faktur ${inv.number}`);
      tx.update(salesInvoices).set({ paidCents: paid, status: docStatus(paid, inv.totalCents) }).where(eq(salesInvoices.id, inv.id)).run();
      fxAllocs.push({ foreignCents: a.amountCents, docRateMicros: inv.rateMicros });
    } else {
      const bill = tx.select().from(purchaseBills).where(and(eq(purchaseBills.orgId, orgId), eq(purchaseBills.id, a.targetId))).get();
      if (!bill) throw new Error("Tagihan alokasi tidak ditemukan");
      if (bill.currency !== currency) throw new Error(`Mata uang pembayaran (${currency}) ≠ tagihan ${bill.number} (${bill.currency})`);
      const paid = bill.paidCents + a.amountCents;
      if (paid > bill.totalCents) throw new Error(`Alokasi melebihi sisa tagihan ${bill.number}`);
      tx.update(purchaseBills).set({ paidCents: paid, status: docStatus(paid, bill.totalCents) }).where(eq(purchaseBills.id, bill.id)).run();
      fxAllocs.push({ foreignCents: a.amountCents, docRateMicros: bill.rateMicros });
    }
  }

  const amountForeign = d.allocations.reduce((s, a) => s + a.amountCents, 0);
  const pay = tx
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
      createdBy: userId,
      clientId: d.clientId ?? null,
    })
    .returning()
    .get();

  tx.insert(paymentAllocations)
    .values(d.allocations.map((a) => ({ orgId, paymentId: pay.id, targetType: a.targetType, targetId: a.targetId, amountCents: a.amountCents })))
    .run();

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
  const journalId = insertDraftJournal(tx, orgId, draft, { createdBy: userId, sourceId: pay.id, number });
  tx.update(payments).set({ journalId }).where(eq(payments.id, pay.id)).run();
  return { ...pay, journalId };
}
