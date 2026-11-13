import { describe, expect, it } from "vitest";
import { correctLine, proveStatement } from "@/lib/statements/proof";
import type { StmtLine } from "@/lib/statements/types";

const line = (n: number, debit: number, credit: number, balance: number | null): StmtLine => ({
  id: `l${n}`,
  date: "2026-10-01",
  description: `line ${n}`,
  debit,
  credit,
  balance,
  page: 1,
});


function build(opening: number, steps: [number, number][], withBalance = true): StmtLine[] {
  let b = opening;
  return steps.map(([d, c], i) => {
    b += c - d;
    return line(i + 1, d, c, withBalance ? b : null);
  });
}

describe("balance proof", () => {
  const opening = 1_000_000; // RM10,000.00
  const steps: [number, number][] = [[0, 100000], [25050, 0], [9999, 0], [0, 10]];
  const closing = opening + 100000 - 25050 - 9999 + 10;

  it("proves a clean statement to the cent", () => {
    const r = proveStatement({ opening, closing, lines: build(opening, steps) });
    expect(r.status).toBe("proven");
    expect(r.label).toBe("Proven to the cent");
    expect(r.breaks).toHaveLength(0);
    expect(r.difference).toBe(0);
  });

  it("is off by one sen and never proven", () => {
    const r = proveStatement({ opening, closing: closing + 1, lines: build(opening, steps) });
    expect(r.status).toBe("break");
    expect(r.closingMismatch).toBe(true);
    expect(r.difference).toBe(1);
  });

  it("flags the exact line that breaks the chain, with expected and found", () => {
    const lines = build(opening, steps);
    lines[1] = { ...lines[1], debit: 25500 }; // amount mis-read: 255.00 instead of 250.50
    const r = proveStatement({ opening, closing, lines });
    expect(r.status).toBe("break");
    expect(r.label).toBe("Break at line 2");
    expect(r.breaks).toHaveLength(1);
    expect(r.breaks[0].expected).toBe(opening + 100000 - 25500);
    expect(r.breaks[0].found).toBe(opening + 100000 - 25050);
    expect(r.breaks[0].implied).toEqual({ side: "debit", amount: 25050 });
  });

  it("re-runs clean after the line is corrected", () => {
    let lines = build(opening, steps);
    lines[1] = { ...lines[1], debit: 25500 };
    lines = correctLine(lines, "l2", "debit", 25050);
    const r = proveStatement({ opening, closing, lines });
    expect(r.status).toBe("proven");
    expect(lines[1].corrected?.debit).toBe(25500); // the bank's printed figure is kept
  });

  it("reports totals only when no running balance is printed", () => {
    const r = proveStatement({ opening, closing, lines: build(opening, steps, false) });
    expect(r.status).toBe("totals-only");
    expect(r.label).toBe("No running balance: totals only");
  });

  it("is totals only when just some lines print a balance", () => {
    const lines = build(opening, steps);
    lines[2] = { ...lines[2], balance: null };
    expect(proveStatement({ opening, closing, lines }).status).toBe("totals-only");
  });

  it("still catches a break on lines that do print a balance when others do not", () => {
    const lines = build(opening, steps);
    lines[2] = { ...lines[2], balance: null };
    lines[3] = { ...lines[3], credit: 20 };
    const r = proveStatement({ opening, closing, lines });
    expect(r.status).toBe("break");
    expect(r.breaks[0].lineNo).toBe(4);
  });

  it("totals-only statements with a wrong closing are never proven", () => {
    const r = proveStatement({ opening, closing: closing - 500, lines: build(opening, steps, false) });
    expect(r.status).toBe("break");
  });

  it("asks for balances rather than guessing when opening or closing is missing", () => {
    expect(proveStatement({ opening: null, closing, lines: build(opening, steps) }).status).toBe("incomplete");
    expect(proveStatement({ opening, closing: null, lines: build(opening, steps) }).status).toBe("incomplete");
  });

  it("handles overdrawn running balances", () => {
    const lines = build(10000, [[30000, 0], [0, 5000]]);
    expect(lines[0].balance).toBe(-20000);
    expect(proveStatement({ opening: 10000, closing: -15000, lines }).status).toBe("proven");
  });

  it("cross-checks printed totals when the bank prints them", () => {
    const lines = build(opening, steps);
    const ok = proveStatement({ opening, closing, lines, printedTotals: { debit: 35049, credit: 100010 } });
    expect(ok.printed.debit?.ok).toBe(true);
    expect(ok.printed.credit?.ok).toBe(true);
    const bad = proveStatement({ opening, closing, lines, printedTotals: { debit: 35050, credit: 100010 } });
    expect(bad.printed.debit?.ok).toBe(false);
  });

  it("an empty statement with equal balances is totals only, not proven", () => {
    expect(proveStatement({ opening: 500, closing: 500, lines: [] }).status).toBe("totals-only");
  });
});
