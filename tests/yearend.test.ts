import { describe, expect, it } from "vitest";
import { yearEndSummaries } from "@/lib/statements/yearend";
import { stmt } from "./helpers";

const month = (id: string, m: string, opening: number, brk = false) =>
  stmt(id, opening, [{ date: `${m}-10`, desc: "X", debit: 1000 }, { date: `${m}-12`, desc: "Y", credit: 500 }], { month: m, breakAt: brk ? 0 : undefined });

describe("year-end summary", () => {
  it("needs at least two months for an account", () => {
    expect(yearEndSummaries([month("a", "2026-09", 10000)])).toEqual([]);
  });
  it("counts proven months, names missing months and counts breaks", () => {
    const a = month("a", "2026-08", 10000);
    const b = month("b", "2026-10", 9500, true); // September missing, October has a break
    const [sum] = yearEndSummaries([a, b]);
    expect(sum.from).toBe("2026-08");
    expect(sum.to).toBe("2026-10");
    expect(sum.proven).toBe(1);
    expect(sum.missing).toEqual(["2026-09"]);
    expect(sum.breaks).toBeGreaterThanOrEqual(1);
    expect(sum.months.map((m) => m.status)).toEqual(["proven", "missing", "not-proven"]);
  });
  it("is clean when every month is present and ties", () => {
    const a = month("a", "2026-09", 10000);
    const b = month("b", "2026-10", a.closing as number);
    const [sum] = yearEndSummaries([a, b]);
    expect(sum).toMatchObject({ proven: 2, missing: [], breaks: 0 });
  });
  it("counts a month to month balance mismatch as a break", () => {
    const [sum] = yearEndSummaries([month("a", "2026-09", 10000), month("b", "2026-10", 1)]);
    expect(sum.breaks).toBe(1);
  });
});
