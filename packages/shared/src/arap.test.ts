import { describe, it, expect } from "vitest";
import {
  buildSalesInvoiceJournalFromLines,
  buildPurchaseBillJournalFromLines,
  buildSettlementJournal,
  makeAccountResolver,
  sumDebit,
  sumCredit,
  type AccountLite,
} from "./posting/index.js";
import { coaTemplate, type CoaTemplateAccount } from "./coa.js";
import { isLedgerBalanced, trialBalance, agingBuckets, type AgingDoc } from "./reports.js";
import { formatDocNumber, periodKey } from "./sequence.js";

const lite = (a: CoaTemplateAccount): AccountLite => ({ id: a.code, code: a.code, subtype: a.subtype, isPostable: true });
const resolve = makeAccountResolver(coaTemplate("emkm").map(lite));

describe("AR/AP multi-baris", () => {
  it("faktur multi-baris + PPN tetap berimbang & neraca saldo = 0 setelah pelunasan", () => {
    const inv = buildSalesInvoiceJournalFromLines({
      date: "2026-02-01",
      contactId: "c1",
      arAccountId: resolve("accounts_receivable"),
      revenueLines: [
        { accountId: resolve("revenue"), amountCents: 7_000_00 },
        { accountId: resolve("other_income"), amountCents: 3_000_00 },
      ],
      taxCents: 1_100_00,
      taxOutputAccountId: resolve("tax_output"),
    });
    expect(sumDebit(inv)).toBe(sumCredit(inv));
    expect(sumDebit(inv)).toBe(11_100_00);

    const receipt = buildSettlementJournal({
      date: "2026-02-10",
      kind: "receive",
      cashAccountId: resolve("cash_bank"),
      contactAccountId: resolve("accounts_receivable"),
      contactId: "c1",
      amountCents: 11_100_00,
    });
    const all = [...inv.lines, ...receipt.lines];
    expect(isLedgerBalanced(all)).toBe(true);
    expect(trialBalance(all).reduce((s, r) => s + r.balanceCents, 0)).toBe(0);
  });

  it("tagihan pembelian multi-baris + PPN masukan berimbang", () => {
    const bill = buildPurchaseBillJournalFromLines({
      date: "2026-02-02",
      contactId: "v1",
      apAccountId: resolve("accounts_payable"),
      debitLines: [
        { accountId: resolve("inventory"), amountCents: 4_000_00 },
        { accountId: resolve("expense"), amountCents: 1_000_00 },
      ],
      taxCents: 550_00,
      taxInputAccountId: resolve("tax_input"),
    });
    expect(sumDebit(bill)).toBe(sumCredit(bill));
    expect(sumCredit(bill)).toBe(5_550_00);
  });
});

describe("penomoran dokumen", () => {
  it("periodKey & formatDocNumber", () => {
    expect(periodKey("2026-02-01", "year")).toBe("2026");
    expect(periodKey("2026-02-01", "month")).toBe("2026-02");
    expect(periodKey("2026-02-01", "none")).toBe("");
    expect(formatDocNumber("INV-", "2026", 7, 4)).toBe("INV-2026/0007");
    expect(formatDocNumber("JV-", "", 42, 5)).toBe("JV-00042");
  });
});

describe("aging buckets", () => {
  it("mengelompokkan umur relatif asOf", () => {
    const docs: AgingDoc[] = [
      { date: "2026-02-01", dueDate: "2026-03-01", outstandingCents: 100 }, // belum jatuh tempo (asOf 2026-02-15)
      { date: "2026-01-01", dueDate: "2026-01-20", outstandingCents: 200 }, // 26 hari lewat
      { date: "2025-10-01", dueDate: "2025-10-15", outstandingCents: 300 }, // > 90 hari
      { date: "2026-02-01", dueDate: "2026-02-10", outstandingCents: 0 }, // diabaikan (lunas)
    ];
    const b = agingBuckets(docs, "2026-02-15");
    expect(b.current).toBe(100);
    expect(b.d1_30).toBe(200);
    expect(b.d90plus).toBe(300);
    expect(b.total).toBe(600);
  });
});
