import { describe, expect, it } from "vitest";
import { normalisePayee, payeeMatches, refMatches, squash } from "@/lib/match/normalise";

describe("payee normaliser", () => {
  it("strips Malaysian transfer wording", () => {
    expect(normalisePayee("DUITNOW QR TRADEWIND COURIER SDN BHD").text).toBe("TRADEWIND COURIER");
    expect(normalisePayee("IBG PAYMENT ALI TRADING").text).toBe("ALI TRADING");
    expect(normalisePayee("IBFT TRANSFER BINTANG STATIONERY").text).toBe("BINTANG STATIONERY");
    expect(normalisePayee("JOMPAY KILAT BROADBAND REF 8810045512").text).toBe("KILAT BROADBAND");
    expect(normalisePayee("FPX PAYMENT PYMT TRF MERCHANT 5519").text).toBe("");
    expect(normalisePayee("INTER-BANK PAYMENT INTO A/C PELANGGAN RUNCIT MAJU SDN BHD INV SM-2210-003").text).toBe("PELANGGAN RUNCIT MAJU INV");
  });
  it("removes reference codes, months, extra spaces and case", () => {
    expect(normalisePayee("  transfer   to a/c  Harta   Properti Rental  RENT OCT 2026 ").text).toBe("HARTA PROPERTI RENTAL RENT");
    expect(normalisePayee("sinar fuel card sdn bhd").text).toBe("SINAR FUEL CARD");
  });
  it("makes bank and supplier names comparable", () => {
    expect(normalisePayee("Sinar Fuel Card Sdn Bhd").text).toBe(normalisePayee("TRANSFER TO A/C SINAR FUEL CARD SDN BHD").text);
  });
});

describe("payee match", () => {
  it("matches when every supplier word is in the description", () => {
    expect(payeeMatches("Tradewind Courier Sdn Bhd", "DUITNOW QR TRADEWIND COURIER SDN BHD")).toBe(true);
    expect(payeeMatches("Bintang Stationery", "IBFT TRANSFER BINTANG STATIONERY CASH BILL 5531")).toBe(true);
  });
  it("does not match a different payee or a bare transfer", () => {
    expect(payeeMatches("Mutiara Packaging Sdn Bhd", "FPX PAYMENT MERCHANT 5519 REF 77120045")).toBe(false);
    expect(payeeMatches("Ali Trading", "TRANSFER TO A/C HARTA PROPERTI RENTAL")).toBe(false);
    expect(payeeMatches("", "ANYTHING")).toBe(false);
  });
});

describe("reference match ignores dashes, spaces and case on both sides", () => {
  it("matches across formatting", () => {
    expect(refMatches("LPU-88213-10", "TRANSFER TO A/C LEMBAH POWER UTILITIES LPU-88213-10")).toBe(true);
    expect(refMatches("lpu 88213 10", "ref LPU88213-10")).toBe(true);
    expect(refMatches("LPU88213-10", "lpu 88213 10 paid")).toBe(true);
    expect(refMatches("SFC-5521907", "sfc5521907")).toBe(true);
  });
  it("needs a reasonably long reference and a real match", () => {
    expect(refMatches("5531", "CASH BILL 5531")).toBe(false); // too short to trust
    expect(refMatches("", "ANYTHING")).toBe(false);
    expect(refMatches("LPU-88213-09", "LPU-88213-10")).toBe(false);
    expect(squash("a-b c/D")).toBe("ABCD");
  });
});
