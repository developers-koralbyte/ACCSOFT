import { describe, expect, it } from "vitest";
import { checkContinuity, findDuplicate } from "@/lib/statements/continuity";

const st = (id: string, month: string, opening: number, closing: number, key = "1111:aaaaaa") => ({
  id,
  bank: "Bank A",
  accountKey: key,
  accountLast4: key.slice(0, 4),
  periodStart: `${month}-01`,
  periodEnd: `${month}-28`,
  opening,
  closing,
});

describe("continuity", () => {
  it("passes when closing equals the next opening", () => {
    expect(checkContinuity([st("a", "2026-09", 100, 500), st("b", "2026-10", 500, 900)])).toEqual([]);
  });
  it("flags a mismatch between closing and next opening", () => {
    const issues = checkContinuity([st("a", "2026-09", 100, 500), st("b", "2026-10", 510, 900)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("mismatch");
    expect(issues[0].level).toBe("error");
  });
  it("names the missing month", () => {
    const issues = checkContinuity([st("a", "2026-08", 100, 500), st("b", "2026-10", 500, 900)]);
    expect(issues[0].kind).toBe("gap");
    expect(issues[0].message).toContain("September 2026");
    expect(issues[0].months).toEqual(["2026-09"]);
  });
  it("names several missing months and spans a year end", () => {
    const issues = checkContinuity([st("a", "2026-11", 1, 2), st("b", "2027-03", 2, 3)]);
    expect(issues[0].months).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
  it("does not report a balance mismatch on top of a gap", () => {
    const issues = checkContinuity([st("a", "2026-08", 100, 500), st("b", "2026-10", 999, 900)]);
    expect(issues.map((i) => i.kind)).toEqual(["gap"]);
  });
  it("flags overlapping periods", () => {
    const b = { ...st("b", "2026-10", 500, 900), periodStart: "2026-09-20" };
    const issues = checkContinuity([st("a", "2026-09", 100, 500), b]);
    expect(issues[0].kind).toBe("overlap");
  });
  it("sorts statements before checking", () => {
    expect(checkContinuity([st("b", "2026-10", 500, 900), st("a", "2026-09", 100, 500)])).toEqual([]);
  });
  it("does not compare different accounts with each other", () => {
    const issues = checkContinuity([st("a", "2026-09", 100, 500, "1111:aaaaaa"), st("b", "2026-10", 7, 9, "2222:bbbbbb")]);
    expect(issues.some((i) => i.kind === "mismatch" || i.kind === "gap")).toBe(false);
  });
  it("notes a changed account number at the same bank", () => {
    const issues = checkContinuity([st("a", "2026-09", 100, 500, "1111:aaaaaa"), st("b", "2026-10", 500, 900, "2222:bbbbbb")]);
    expect(issues.some((i) => i.kind === "account-changed")).toBe(true);
  });
  it("detects a duplicate upload", () => {
    const a = st("a", "2026-09", 100, 500);
    expect(findDuplicate([a], { ...st("x", "2026-09", 100, 500) })?.id).toBe("a");
    expect(findDuplicate([a], st("x", "2026-09", 100, 501))).toBeUndefined();
    expect(findDuplicate([a], st("x", "2026-09", 100, 500, "2222:bbbbbb"))).toBeUndefined();
  });
});
