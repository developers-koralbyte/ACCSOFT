import { fmtDate, fmtDateTime } from "../money";
import { payeeLabel } from "../chase/questions";
import { labelFor, rateOn } from "../tax";
import type { LineState } from "../match/types";
import type { MonthSnapshot, SnapLine, SnapStatement } from "../month/types";

// One row per bank line, built ONLY from the approval snapshot, so an export always agrees with what was approved.
// Amounts are integer sen. No tax amount is calculated for a bank line: the tax code and the rate in force are shown.

export interface ExportLine {
  statementId: string;
  bank: string;
  accountLast4: string;
  lineNo: number;
  date: string; // YYYY-MM-DD
  description: string;
  debit: number;
  credit: number;
  amount: number; // credit minus debit: money in is positive, money out is negative
  balance: number | null;
  state: LineState;
  stateLabel: string;
  category: string;
  taxCode: string;
  taxLabel: string;
  taxRate: string; // for example "8%", empty when the code was not in force that day
  payee: string;
  reference: string; // matched document invoice numbers
  documents: string; // matched documents, supplier and number
  basis: string; // the rule, or the person, behind the line's state
  confirmed: boolean;
  answer: string;
}

const STATE_LABEL: Record<LineState, string> = { matched: "Matched", suggested: "Suggested", "bank-only": "Bank only", unexplained: "Unexplained", answered: "Answered" };

export function basisOf(l: SnapLine): string {
  if (l.accepted) return `Accepted by ${l.accepted.by} on ${fmtDate(l.accepted.at.slice(0, 10))}${l.accepted.origin ? ` (came from: ${l.accepted.origin})` : ""}`;
  if (l.answer) return `Answered by the client, recorded by ${l.answer.by}, ${fmtDateTime(l.answer.at)}`;
  return l.ruleLabel;
}

export function exportLinesOf(snap: SnapStatement, bills: MonthSnapshot["bills"]): ExportLine[] {
  const byId = new Map(bills.map((b) => [b.id, b]));
  return snap.lines.map((l) => {
    const docs = l.billIds.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => Boolean(b));
    const rate = rateOn(l.taxCode, l.date);
    return {
      statementId: snap.id,
      bank: snap.bank,
      accountLast4: snap.accountLast4,
      lineNo: l.lineNo,
      date: l.date,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      amount: l.credit - l.debit,
      balance: l.balance,
      state: l.state,
      stateLabel: STATE_LABEL[l.state],
      category: l.category,
      taxCode: l.taxCode,
      taxLabel: labelFor(l.taxCode),
      taxRate: rate === null ? "" : `${Math.round(rate * 1000) / 10}%`,
      payee: docs[0]?.supplier ?? payeeLabel(l.description),
      reference: docs.map((d) => d.invoiceNo).filter(Boolean).join(" "),
      documents: docs.map((d) => `${d.supplier}${d.invoiceNo ? ` ${d.invoiceNo}` : ""}`).join(" + "),
      basis: basisOf(l),
      confirmed: l.categoryConfirmed,
      answer: l.answer?.text ?? (l.answer ? "(document linked)" : ""),
    };
  });
}

export function exportLines(snapshot: MonthSnapshot): ExportLine[] {
  return snapshot.statements.flatMap((s) => exportLinesOf(s, snapshot.bills));
}
