import { describe, it, expect } from "vitest";
import { coaTemplate } from "./coa.js";
import { computeTax } from "./money.js";

describe("template COA", () => {
  it("EMKM punya subtype inti yang dibutuhkan posting", () => {
    const subs = new Set(coaTemplate("emkm").map((a) => a.subtype));
    for (const s of ["cash_bank", "accounts_receivable", "inventory", "tax_input", "accounts_payable", "tax_output", "revenue", "cogs", "retained_earnings"]) {
      expect(subs.has(s)).toBe(true);
    }
  });

  it("kode akun unik dalam satu template", () => {
    for (const std of ["emkm", "ep", "sak"] as const) {
      const codes = coaTemplate(std).map((a) => a.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("EP/SAK memperluas EMKM (mis. ada utang bank)", () => {
    const epSubs = new Set(coaTemplate("ep").map((a) => a.subtype));
    expect(epSubs.has("loan")).toBe(true);
    expect(coaTemplate("ep").length).toBeGreaterThan(coaTemplate("emkm").length);
  });
});

describe("PPN DPP Nilai Lain 2026", () => {
  it("PPN 12% dengan DPP 11/12 = efektif 11%", () => {
    // Rp100.000 = 10.000.000 sen
    expect(computeTax(10_000_000, 1200, 11, 12)).toBe(1_100_000);
  });

  it("tanpa DPP nilai lain (faktor 1/1) = tarif penuh", () => {
    expect(computeTax(10_000_000, 1200)).toBe(1_200_000);
  });
});
