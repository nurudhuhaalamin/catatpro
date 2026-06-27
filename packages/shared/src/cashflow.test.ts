import { describe, it, expect } from "vitest";
import { classifyCashFlow } from "./cashflow.js";

describe("klasifikasi arus kas", () => {
  it("pendapatan/beban/AR/AP/persediaan/pajak = operasional", () => {
    expect(classifyCashFlow("income", "revenue")).toBe("operating");
    expect(classifyCashFlow("expense", "cogs")).toBe("operating");
    expect(classifyCashFlow("asset", "accounts_receivable")).toBe("operating");
    expect(classifyCashFlow("liability", "accounts_payable")).toBe("operating");
    expect(classifyCashFlow("asset", "inventory")).toBe("operating");
    expect(classifyCashFlow("liability", "tax_output")).toBe("operating");
  });
  it("aset tetap = investasi", () => {
    expect(classifyCashFlow("asset", "fixed_asset")).toBe("investing");
    expect(classifyCashFlow("asset", "accumulated_depreciation")).toBe("investing");
  });
  it("pinjaman & ekuitas = pendanaan", () => {
    expect(classifyCashFlow("liability", "loan")).toBe("financing");
    expect(classifyCashFlow("equity", "equity")).toBe("financing");
    expect(classifyCashFlow("equity", "drawing")).toBe("financing");
  });
});

describe("PPN terutang", () => {
  it("keluaran − masukan", () => {
    const output = 1_100_00;
    const input = 550_00;
    expect(output - input).toBe(550_00);
  });
});
