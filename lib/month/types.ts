import type { AcceptedInfo, LineAnswer, LineState } from "../match/types";
import type { ProofStatus } from "../statements/types";

// Everything here is stored on approval, so an approved month never changes when a bill is edited or added later.
// Amounts are integer sen.

export interface Signoff {
  staffId: string;
  name: string;
  at: string;
}

export interface SnapLine {
  lineId: string;
  lineNo: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number | null;
  page: number;
  state: LineState;
  rule?: string;
  ruleLabel: string;
  billIds: string[];
  category: string;
  taxCode: string;
  categoryConfirmed: boolean;
  learned: boolean;
  accepted?: AcceptedInfo;
  answer?: LineAnswer;
  questionSentAt?: string;
  corrected?: { debit: number; credit: number };
}

export interface SnapStatement {
  id: string;
  fileName: string;
  bank: string;
  accountLast4: string;
  periodStart: string;
  periodEnd: string;
  opening: number | null;
  closing: number | null;
  proofStatus: ProofStatus;
  proofLabel: string;
  totalDebit: number;
  totalCredit: number;
  totalsOnlyAcknowledged: boolean;
  booksBalance: number | null; // balance per books, typed in by the accountant, sen. Null when not given
  counts: Record<LineState, number>;
  reconciled: boolean;
  lines: SnapLine[];
}

export interface SnapBill {
  id: string;
  supplier: string;
  invoiceNo: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  category: string;
  taxCode: string;
}

export interface MonthSnapshot {
  takenAt: string;
  statements: SnapStatement[];
  bills: SnapBill[];
  missingDocs: string[];
  waived: string[];
  outstandingDocs: number;
}

export interface MonthHistoryEntry {
  at: string;
  by: string;
  kind: "prepared" | "approved" | "reopened";
  text: string;
}

export interface MonthRecord {
  clientId: string;
  month: string;
  waived: string[]; // document kinds marked "Not needed this month"
  ackTotalsOnly: string[]; // statement ids whose "totals only" warning was acknowledged
  booksBalance?: Record<string, number>; // optional balance per books per statement id, typed in from the ledger (sen)
  prepared?: Signoff;
  reviewed?: Signoff;
  outstandingAcknowledged?: number; // documents outstanding when the approver ticked the acknowledgement
  snapshot?: MonthSnapshot;
  history: MonthHistoryEntry[];
}
