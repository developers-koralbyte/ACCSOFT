import { describe, expect, it } from "vitest";
import { fmtDate, fmtRM, monthName, parseSen, senToPlain, toSen } from "@/lib/money";

describe("money in sen", () => {
  it("parses without float drift", () => {
    expect(parseSen("1,020.00")).toBe(102000);
    expect(parseSen("0.10")).toBe(10);
    expect(parseSen("19.9")).toBe(1990);
    expect(parseSen("RM 12")).toBe(1200);
    expect(parseSen("-45.50")).toBe(-4550);
    expect(parseSen("abc")).toBeNull();
    expect(parseSen("1.234")).toBeNull();
  });
  it("sums exactly where floats would not", () => {
    expect(parseSen("0.10")! + parseSen("0.20")!).toBe(parseSen("0.30"));
    expect(toSen(1.005 * 3)).toBe(Math.round(1.005 * 3 * 100));
  });
  it("formats RM with two decimals", () => {
    expect(fmtRM(123450)).toBe("RM1,234.50");
    expect(fmtRM(5)).toBe("RM0.05");
    expect(fmtRM(-240000)).toBe("-RM2,400.00");
    expect(fmtRM(100000000)).toBe("RM1,000,000.00");
    expect(senToPlain(240000)).toBe("2400.00");
  });
  it("formats dates as DD/MM/YYYY", () => {
    expect(fmtDate("2026-10-12")).toBe("12/10/2026");
    expect(monthName("2026-09")).toBe("September 2026");
  });
});
