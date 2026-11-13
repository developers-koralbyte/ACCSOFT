// All amounts here are integer sen. Dates are ISO YYYY-MM-DD.

export interface StmtLine {
  id: string;
  date: string;
  description: string;
  debit: number; // money out
  credit: number; // money in
  balance: number | null; // printed running balance, negative when overdrawn
  page: number; // page of the source PDF
  // Set once an accountant edits the amount, so the audit pack can show what the bank printed.
  corrected?: { debit: number; credit: number; at: string };
  // True when the PDF printed an unsigned amount and the direction was read from the balance change.
  directionInferred?: boolean;
}

export type StatementKind = "pdf-text" | "scan" | "sample";

export interface Statement {
  id: string;
  clientId: string;
  bank: string;
  layout?: string; // generic layout label, for example "Bank A layout"
  accountLast4: string; // the full number is never stored
  accountKey: string; // last 4 plus a short hash, so accounts can be compared without keeping the number
  periodStart: string;
  periodEnd: string;
  opening: number | null;
  closing: number | null;
  printedTotals?: { debit: number | null; credit: number | null };
  lines: StmtLine[];
  fileName: string;
  kind: StatementKind;
  addedAt: string;
  warnings: string[];
}

export type ProofStatus = "proven" | "break" | "totals-only" | "incomplete";

export interface LineBreak {
  index: number; // 0 based
  lineNo: number; // 1 based, what the user sees
  lineId: string;
  expected: number;
  found: number;
  // What the printed balance implies the amount should have been
  implied: { side: "debit" | "credit"; amount: number } | null;
}

export interface ProofResult {
  status: ProofStatus;
  label: string;
  detail: string;
  opening: number | null;
  closing: number | null;
  totalDebit: number;
  totalCredit: number;
  computedClosing: number | null;
  difference: number | null; // closing minus computed closing, 0 when it ties
  totalsTie: boolean;
  closingMismatch: boolean;
  linesWithBalance: number;
  lineCount: number;
  breaks: LineBreak[];
  printed: { debit?: { printed: number; ok: boolean }; credit?: { printed: number; ok: boolean } };
}

export interface ContinuityIssue {
  kind: "gap" | "mismatch" | "overlap" | "duplicate" | "account-changed";
  level: "error" | "warn" | "info";
  message: string;
  statementIds: string[];
  months?: string[];
}
