import { describe, expect, it } from "vitest";
import { TAX_RATES, codesOn, isValidOn, rateOn, suggestTaxCodeOn, taxOptionsFor } from "@/lib/tax";
import { suggestTaxCode, TAX_CODES } from "@/lib/malaysia";

describe("date aware tax table", () => {
  it("applies a rate only inside its effective dates", () => {
    expect(rateOn("SVC8", "2024-03-01")).toBe(0.08);
    expect(rateOn("SVC8", "2024-02-29")).toBeNull();
    expect(isValidOn("SVC8", "2026-10-12")).toBe(true);
    expect(isValidOn("SVC6", "2017-01-01")).toBe(false);
    expect(rateOn("NONE", "2001-05-05")).toBe(0);
  });
  it("lists the codes usable on a date", () => {
    expect(codesOn("2024-02-29").map((c) => c.code)).not.toContain("SVC8");
    expect(codesOn("2026-10-12").map((c) => c.code)).toContain("SVC8");
  });
  it("supports an end date", () => {
    const r = { code: "OLD", label: "x", rate: 0.05, from: "2020-01-01", to: "2020-12-31" };
    TAX_RATES.push(r);
    expect(rateOn("OLD", "2020-12-31")).toBe(0.05);
    expect(rateOn("OLD", "2021-01-01")).toBeNull();
    TAX_RATES.pop();
  });
  it("suggests a code by the document date, not today", () => {
    expect(suggestTaxCodeOn(8, 100, "2026-10-01")).toBe("SVC8");
    expect(suggestTaxCodeOn(6, 100, "2026-10-01")).toBe("SVC6");
    expect(suggestTaxCodeOn(8, 100, "2023-06-01")).toBe("NONE"); // 8% did not exist yet, so it is not forced into another rate
    expect(suggestTaxCodeOn(0, 100, "2026-10-01")).toBe("NONE");
    expect(suggestTaxCodeOn(37, 100, "2026-10-01")).toBe("NONE");
  });
  it("the review queue still gets the same code list and behaviour", () => {
    expect(TAX_CODES.map((c) => c.code)).toEqual(["NONE", "SVC6", "SVC8", "ST10", "ST5"]);
    expect(suggestTaxCode(15.92, 199, "2026-10-05")).toBe("SVC8");
  });
});

describe("tax dropdown options", () => {
  it("lists only codes in force on the document date", () => {
    expect(taxOptionsFor("2024-02-29").map((o) => o.code)).toEqual(["NONE", "SVC6", "ST10", "ST5"]);
    expect(taxOptionsFor("2026-10-05").map((o) => o.code)).toContain("SVC8");
  });
  it("keeps an existing out-of-date code, flagged, so nothing silently changes", () => {
    const o = taxOptionsFor("2023-06-01", "SVC8");
    expect(o[o.length - 1]).toMatchObject({ code: "SVC8", valid: false });
    expect(o[o.length - 1].label).toContain("not valid on this date");
    expect(taxOptionsFor("2026-10-05", "SVC8").every((x) => x.valid)).toBe(true);
  });
});
