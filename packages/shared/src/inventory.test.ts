import { describe, it, expect } from "vitest";
import { movingAverage, stockValue } from "./inventory.js";
import {
  buildPurchaseBillJournalFromLines,
  buildSalesInvoiceJournalFromLines,
  makeAccountResolver,
  type AccountLite,
} from "./posting/index.js";
import { coaTemplate, type CoaTemplateAccount } from "./coa.js";
import { isLedgerBalanced, trialBalance } from "./reports.js";

const lite = (a: CoaTemplateAccount): AccountLite => ({ id: a.code, code: a.code, subtype: a.subtype, isPostable: true });
const resolve = makeAccountResolver(coaTemplate("emkm").map(lite));

describe("rata-rata bergerak", () => {
  it("10@1000 lalu 10@1400 → 1200", () => {
    expect(movingAverage(10, 1000, 10, 1400)).toBe(1200);
  });
  it("stok awal kosong → biaya = harga masuk", () => {
    expect(movingAverage(0, 0, 5, 2500)).toBe(2500);
  });
  it("stockValue = qty × avg", () => {
    expect(stockValue(6, 1000)).toBe(6000);
  });
});

describe("siklus beli → jual (perpetual) tetap seimbang", () => {
  it("beli 10@1.000, jual 4@1.500 (HPP 4.000): buku besar balance & neraca saldo = 0", () => {
    const buy = buildPurchaseBillJournalFromLines({
      date: "2026-03-01",
      contactId: "v1",
      apAccountId: resolve("accounts_payable"),
      debitLines: [{ accountId: resolve("inventory"), amountCents: 10 * 1000 }],
    });
    const sell = buildSalesInvoiceJournalFromLines({
      date: "2026-03-05",
      contactId: "c1",
      arAccountId: resolve("accounts_receivable"),
      revenueLines: [{ accountId: resolve("revenue"), amountCents: 4 * 1500 }],
      cogsLines: [{ cogsAccountId: resolve("cogs"), inventoryAccountId: resolve("inventory"), amountCents: 4 * 1000 }],
    });
    const all = [...buy.lines, ...sell.lines];
    expect(isLedgerBalanced(all)).toBe(true);
    expect(trialBalance(all).reduce((s, r) => s + r.balanceCents, 0)).toBe(0);
    // Saldo persediaan = 10.000 − 4.000 = 6.000 (6 unit @1.000)
    const inv = trialBalance(all).find((r) => r.accountId === resolve("inventory"))!;
    expect(inv.balanceCents).toBe(6000);
  });
});
