import { describe, it, expect } from "vitest";
import { convertToBase } from "./money.js";
import { fxOnSettlement } from "./forex.js";

describe("konversi mata uang", () => {
  it("100 USD @15.500,50 → Rp1.550.050", () => {
    // 100 USD = 10000 cents; rate 15500.50 → micros 15_500_500_000
    expect(convertToBase(10000, 15_500_500_000)).toBe(155_005_000); // Rp1.550.050 (cents)
  });
  it("mata uang dasar (rate 1e6) tak berubah", () => {
    expect(convertToBase(123456, 1_000_000)).toBe(123456);
  });
});

describe("selisih kurs terealisasi", () => {
  it("piutang: kurs naik → laba selisih kurs", () => {
    // AR 100 USD dibukukan @15.000; dibayar @15.500
    const r = fxOnSettlement("receive", [{ foreignCents: 10000, docRateMicros: 15_000_000_000 }], 15_500_000_000);
    expect(r.counterBaseCents).toBe(150_000_000); // AR base Rp1.500.000
    expect(r.cashBaseCents).toBe(155_000_000); // kas base Rp1.550.000
    expect(r.fxGainCents).toBe(5_000_000); // laba Rp50.000
  });
  it("utang: kurs naik → rugi selisih kurs", () => {
    // AP 100 USD @15.000; dibayar @15.500 → bayar lebih banyak = rugi
    const r = fxOnSettlement("pay", [{ foreignCents: 10000, docRateMicros: 15_000_000_000 }], 15_500_000_000);
    expect(r.fxGainCents).toBe(-5_000_000); // rugi Rp50.000
  });
  it("alokasi multi-dokumen beda kurs", () => {
    const r = fxOnSettlement(
      "receive",
      [
        { foreignCents: 10000, docRateMicros: 15_000_000_000 },
        { foreignCents: 5000, docRateMicros: 16_000_000_000 },
      ],
      15_500_000_000,
    );
    // counter = 100*15000 + 50*16000 = 1.500.000 + 800.000 = 2.300.000
    expect(r.counterBaseCents).toBe(230_000_000);
    // cash = 150*15500 = 2.325.000
    expect(r.cashBaseCents).toBe(232_500_000);
    expect(r.fxGainCents).toBe(2_500_000);
  });
});
