import { monthIndex, monthName, monthOf, nextMonth } from "../money";
import { checkContinuity } from "./continuity";
import { proveStatement } from "./proof";
import type { Statement } from "./types";

export interface YearEndMonth {
  month: string; // YYYY-MM
  status: "proven" | "not-proven" | "missing";
  statementId?: string;
  label: string;
}

export interface YearEndSummary {
  accountKey: string;
  last4: string;
  bank: string;
  from: string;
  to: string;
  months: YearEndMonth[];
  statementCount: number;
  proven: number;
  missing: string[]; // YYYY-MM
  breaks: number; // line breaks, closing balances that do not tie, and month to month mismatches
}

// One summary per account, from the earliest to the latest month loaded.
export function yearEndSummaries(statements: Statement[]): YearEndSummary[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) byAccount.set(s.accountKey, [...(byAccount.get(s.accountKey) ?? []), s]);
  const out: YearEndSummary[] = [];

  for (const [accountKey, list] of Array.from(byAccount.entries())) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
    const from = monthOf(sorted[0].periodEnd);
    const to = monthOf(sorted[sorted.length - 1].periodEnd);
    const byMonth = new Map<string, Statement>();
    sorted.forEach((s) => byMonth.set(monthOf(s.periodEnd), s));

    const months: YearEndMonth[] = [];
    let breaks = 0;
    for (let m = from; monthIndex(m) <= monthIndex(to); m = nextMonth(m)) {
      const s = byMonth.get(m);
      if (!s) {
        months.push({ month: m, status: "missing", label: `${monthName(m)}: statement missing` });
        continue;
      }
      const p = proveStatement(s);
      breaks += p.breaks.length + (p.closingMismatch && p.breaks.length === 0 ? 1 : 0);
      months.push({ month: m, status: p.status === "proven" ? "proven" : "not-proven", statementId: s.id, label: `${monthName(m)}: ${p.label}` });
    }
    breaks += checkContinuity(sorted).filter((i) => i.kind === "mismatch").length;

    out.push({
      accountKey,
      last4: sorted[0].accountLast4,
      bank: sorted[0].bank,
      from,
      to,
      months,
      statementCount: sorted.length,
      proven: months.filter((m) => m.status === "proven").length,
      missing: months.filter((m) => m.status === "missing").map((m) => m.month),
      breaks,
    });
  }
  return out;
}
