import { describe, it, expect } from "vitest";
import { monthlyStraightLine, depreciableRemaining, runAmount } from "./depreciation.js";

describe("penyusutan garis lurus", () => {
  it("12.000.000 selama 12 bulan = 1.000.000/bln", () => {
    expect(monthlyStraightLine(12_000_000, 0, 12)).toBe(1_000_000);
  });
  it("memperhitungkan nilai residu", () => {
    // (10.000.000 − 1.000.000) / 36 = 250.000
    expect(monthlyStraightLine(10_000_000, 1_000_000, 36)).toBe(250_000);
  });
  it("masa manfaat 0 → 0", () => {
    expect(monthlyStraightLine(1_000_000, 0, 0)).toBe(0);
  });
  it("sisa basis tak negatif", () => {
    expect(depreciableRemaining(12_000_000, 0, 12_000_000)).toBe(0);
    expect(depreciableRemaining(12_000_000, 0, 13_000_000)).toBe(0);
  });
  it("run dibatasi sisa basis (tidak over-depreciate)", () => {
    // sudah tersusut 11.500.000 dari 12.000.000 → run 1 bln (1.000.000) dibatasi jadi 500.000
    expect(runAmount(12_000_000, 0, 12, 11_500_000, 1)).toBe(500_000);
  });
  it("run multi-bulan", () => {
    expect(runAmount(12_000_000, 0, 12, 0, 3)).toBe(3_000_000);
  });
});
