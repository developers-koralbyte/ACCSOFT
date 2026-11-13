import { fmtRM } from "../money";
import type { LineBreak, ProofResult, Statement, StmtLine } from "./types";

type Proofable = Pick<Statement, "opening" | "closing" | "lines" | "printedTotals">;

// The balance proof. Two rules, both exact to the sen:
//   1. opening + credits - debits = closing
//   2. where a running balance is printed, previous balance +/- the line amount = that line's balance
// A statement is "proven" only when rule 1 ties, no line breaks rule 2, and every line carries a balance.
export function proveStatement(s: Proofable): ProofResult {
  const lines = s.lines;
  const totalDebit = lines.reduce((a, l) => a + l.debit, 0);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0);
  const linesWithBalance = lines.filter((l) => l.balance !== null).length;

  const breaks: LineBreak[] = [];
  if (s.opening !== null) {
    let running = s.opening;
    lines.forEach((l, index) => {
      running += l.credit - l.debit;
      if (l.balance !== null) {
        if (running !== l.balance) {
          const delta = l.balance - (running - (l.credit - l.debit)); // printed balance minus the balance before this line
          breaks.push({
            index,
            lineNo: index + 1,
            lineId: l.id,
            expected: running,
            found: l.balance,
            implied: delta === 0 ? null : delta > 0 ? { side: "credit", amount: delta } : { side: "debit", amount: -delta },
          });
        }
        running = l.balance; // resync so one bad line is flagged once, not on every line after it
      }
    });
  }

  const printed: ProofResult["printed"] = {};
  if (s.printedTotals?.debit != null) printed.debit = { printed: s.printedTotals.debit, ok: s.printedTotals.debit === totalDebit };
  if (s.printedTotals?.credit != null) printed.credit = { printed: s.printedTotals.credit, ok: s.printedTotals.credit === totalCredit };

  const base = {
    opening: s.opening,
    closing: s.closing,
    totalDebit,
    totalCredit,
    linesWithBalance,
    lineCount: lines.length,
    breaks,
    printed,
  };

  if (s.opening === null || s.closing === null) {
    return {
      ...base,
      status: "incomplete",
      label: "Opening or closing balance missing",
      detail: "Enter the opening and closing balance printed on the statement so the proof can run.",
      computedClosing: null,
      difference: null,
      totalsTie: false,
      closingMismatch: false,
    };
  }

  const computedClosing = s.opening + totalCredit - totalDebit;
  const difference = s.closing - computedClosing;
  const totalsTie = difference === 0;
  const allHaveBalance = lines.length > 0 && linesWithBalance === lines.length;
  const withProof = { ...base, computedClosing, difference, totalsTie };

  if (breaks.length > 0) {
    const first = breaks[0];
    return {
      ...withProof,
      status: "break",
      label: `Break at line ${first.lineNo}`,
      detail: `Expected balance ${fmtRM(first.expected)} but the statement shows ${fmtRM(first.found)}.`,
      closingMismatch: !totalsTie,
    };
  }
  if (!totalsTie) {
    return {
      ...withProof,
      status: "break",
      label: "Closing balance does not tie",
      detail: `Opening plus credits less debits gives ${fmtRM(computedClosing)} but the statement closes at ${fmtRM(s.closing)} (difference ${fmtRM(difference)}).`,
      closingMismatch: true,
    };
  }
  if (allHaveBalance) {
    return {
      ...withProof,
      status: "proven",
      label: "Proven to the cent",
      detail: `Opening ${fmtRM(s.opening)} plus ${fmtRM(totalCredit)} in less ${fmtRM(totalDebit)} out equals ${fmtRM(s.closing)}, and every line's running balance agrees.`,
      closingMismatch: false,
    };
  }
  return {
    ...withProof,
    status: "totals-only",
    label: "No running balance: totals only",
    detail:
      linesWithBalance === 0
        ? "Opening plus credits less debits ties to the closing balance, but this statement prints no running balance, so single lines cannot be checked."
        : `Totals tie, but only ${linesWithBalance} of ${lines.length} lines print a running balance, so the other lines cannot be checked individually.`,
    closingMismatch: false,
  };
}

// Edits one line's amount. The bank's printed figure is kept on the line for the audit trail.
export function correctLine(
  lines: StmtLine[],
  lineId: string,
  side: "debit" | "credit",
  amount: number,
  at = new Date().toISOString(),
): StmtLine[] {
  return lines.map((l) => {
    if (l.id !== lineId) return l;
    const original = l.corrected ?? { debit: l.debit, credit: l.credit, at };
    return {
      ...l,
      debit: side === "debit" ? amount : 0,
      credit: side === "credit" ? amount : 0,
      corrected: { ...original, at },
    };
  });
}
