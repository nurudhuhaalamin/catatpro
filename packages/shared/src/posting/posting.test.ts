import { describe, it, expect } from "vitest";
import {
  buildCashJournal,
  buildTransferJournal,
  buildSalesInvoiceJournal,
  buildPurchaseBillJournal,
  buildSettlementJournal,
  buildManualJournal,
  buildReversalJournal,
  makeAccountResolver,
  sumDebit,
  sumCredit,
  type AccountLite,
  type DraftJournal,
} from "./index.js";
import { coaTemplate, type CoaTemplateAccount } from "../coa.js";
import { isLedgerBalanced, trialBalance } from "../reports.js";

// COA EMKM dipetakan ke AccountLite (code dipakai sebagai id untuk tes).
const lite = (a: CoaTemplateAccount): AccountLite => ({ id: a.code, code: a.code, subtype: a.subtype, isPostable: true });
const resolve = makeAccountResolver(coaTemplate("emkm").map(lite));

const linesOf = (...js: DraftJournal[]) => js.flatMap((j) => j.lines);

describe("invarian double-entry", () => {
  it("faktur penjualan dengan PPN & HPP selalu berimbang", () => {
    const j = buildSalesInvoiceJournal({
      date: "2026-01-15",
      contactId: "c1",
      arAccountId: resolve("accounts_receivable"),
      revenueAccountId: resolve("revenue"),
      subtotalCents: 10_000_00,
      taxCents: 1_100_00,
      taxOutputAccountId: resolve("tax_output"),
      cogsCents: 6_000_00,
      cogsAccountId: resolve("cogs"),
      inventoryAccountId: resolve("inventory"),
    });
    expect(sumDebit(j)).toBe(sumCredit(j));
    // Dr AR 11.100 + Dr HPP 6.000 = Cr Rev 10.000 + Cr PPN 1.100 + Cr Persediaan 6.000
    expect(sumDebit(j)).toBe(11_100_00 + 6_000_00);
  });

  it("tagihan pembelian dengan PPN masukan berimbang", () => {
    const j = buildPurchaseBillJournal({
      date: "2026-01-16",
      contactId: "v1",
      apAccountId: resolve("accounts_payable"),
      debitAccountId: resolve("inventory"),
      subtotalCents: 5_000_00,
      taxCents: 550_00,
      taxInputAccountId: resolve("tax_input"),
    });
    expect(sumDebit(j)).toBe(sumCredit(j));
    expect(sumCredit(j)).toBe(5_550_00);
  });

  it("kas masuk/keluar, transfer & pelunasan berimbang", () => {
    const cash = buildCashJournal({
      date: "2026-01-17",
      direction: "in",
      cashAccountId: resolve("cash_bank"),
      counterAccountId: resolve("other_income"),
      amountCents: 250_00,
    });
    const xfer = buildTransferJournal({
      date: "2026-01-17",
      fromAccountId: resolve("cash_bank"),
      toAccountId: resolve("cash_bank"),
      amountCents: 100_00,
    });
    const settle = buildSettlementJournal({
      date: "2026-01-18",
      kind: "receive",
      cashAccountId: resolve("cash_bank"),
      contactAccountId: resolve("accounts_receivable"),
      contactId: "c1",
      amountCents: 11_100_00,
    });
    for (const j of [cash, xfer, settle]) expect(sumDebit(j)).toBe(sumCredit(j));
  });

  it("buku besar gabungan tetap balance (neraca saldo = 0)", () => {
    const sale = buildSalesInvoiceJournal({
      date: "2026-01-15",
      contactId: "c1",
      arAccountId: resolve("accounts_receivable"),
      revenueAccountId: resolve("revenue"),
      subtotalCents: 10_000_00,
      taxCents: 1_100_00,
      taxOutputAccountId: resolve("tax_output"),
    });
    const receipt = buildSettlementJournal({
      date: "2026-01-20",
      kind: "receive",
      cashAccountId: resolve("cash_bank"),
      contactAccountId: resolve("accounts_receivable"),
      contactId: "c1",
      amountCents: 11_100_00,
    });
    const all = linesOf(sale, receipt);
    expect(isLedgerBalanced(all)).toBe(true);
    const tb = trialBalance(all);
    const net = tb.reduce((s, r) => s + r.balanceCents, 0);
    expect(net).toBe(0);
  });

  it("jurnal manual tidak berimbang ditolak", () => {
    expect(() =>
      buildManualJournal("2026-01-01", [
        { accountId: "a", debitCents: 1000, creditCents: 0 },
        { accountId: "b", debitCents: 0, creditCents: 900 },
      ]),
    ).toThrow(/tidak berimbang/);
  });

  it("jurnal pembalik menukar debit<->kredit dan tetap balance", () => {
    const sale = buildSalesInvoiceJournal({
      date: "2026-01-15",
      contactId: "c1",
      arAccountId: resolve("accounts_receivable"),
      revenueAccountId: resolve("revenue"),
      subtotalCents: 1_000_00,
    });
    const rev = buildReversalJournal(sale, "2026-01-31");
    expect(sumDebit(rev)).toBe(sumCredit(sale));
    expect(sumCredit(rev)).toBe(sumDebit(sale));
  });

  it("resolver melempar bila subtype tak ada di COA", () => {
    expect(() => resolve("loan")).toThrow(/tidak ditemukan/); // 'loan' hanya ada di EP
  });
});
