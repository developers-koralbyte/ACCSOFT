import { monthOf } from "../money";
import { normalisePayee } from "../match/normalise";
import type { LineAnswer, LineResult, Reconciliation } from "../match/types";
import type { Statement } from "../statements/types";
import type { QuestionRecord } from "./types";

export type QuestionStatus = "not-sent" | "sent" | "answered";

export interface QuestionView {
  key: string;
  statementId: string;
  lineId: string;
  lineNo: number;
  month: string;
  date: string;
  amount: number; // sen
  side: "debit" | "credit";
  payee: string;
  description: string;
  status: QuestionStatus;
  sentAt?: string;
  sentBy?: string;
  answer?: LineAnswer;
  result: LineResult;
}

// "IBG PAYMENT ALI TRADING" becomes "Ali Trading".
export function payeeLabel(description: string): string {
  const t = normalisePayee(description).tokens;
  if (t.length === 0) return "someone (see the bank statement)";
  return t.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

// One question for every line that is Unexplained, plus the lines already answered. Derived, never stored:
// only the sent status and the answer are kept.
export function buildQuestions(args: {
  statements: Statement[];
  recon: Reconciliation;
  sent: Record<string, QuestionRecord>;
}): QuestionView[] {
  const out: QuestionView[] = [];
  for (const s of args.statements) {
    for (const line of s.lines) {
      const r = args.recon.results.get(`${s.id}:${line.id}`);
      if (!r || (r.state !== "unexplained" && r.state !== "answered")) continue;
      const rec = args.sent[r.key];
      out.push({
        key: r.key,
        statementId: s.id,
        lineId: line.id,
        lineNo: r.lineNo,
        month: monthOf(s.periodEnd),
        date: line.date,
        amount: line.debit > 0 ? line.debit : line.credit,
        side: line.debit > 0 ? "debit" : "credit",
        payee: payeeLabel(line.description),
        description: line.description,
        status: r.state === "answered" ? "answered" : rec ? "sent" : "not-sent",
        sentAt: rec?.sentAt,
        sentBy: rec?.sentBy,
        answer: r.answer,
        result: r,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.lineNo - b.lineNo));
}

export const openQuestions = (qs: QuestionView[]) => qs.filter((q) => q.status !== "answered");
