import { fmtRM, monthIndex, monthName, monthOf, nextMonth } from "../money";
import type { ContinuityIssue, Statement } from "./types";

type Meta = Pick<Statement, "id" | "bank" | "accountKey" | "accountLast4" | "periodStart" | "periodEnd" | "opening" | "closing">;

// Same account, same period, same closing balance: the same statement uploaded twice.
export function findDuplicate<T extends Meta>(existing: T[], candidate: Meta): T | undefined {
  return existing.find(
    (e) =>
      e.accountKey === candidate.accountKey &&
      e.periodStart === candidate.periodStart &&
      e.periodEnd === candidate.periodEnd &&
      e.closing === candidate.closing,
  );
}

// Checks one client's statements. Statements are grouped by account, then walked month by month.
export function checkContinuity(statements: Meta[]): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const byAccount = new Map<string, Meta[]>();
  for (const s of statements) byAccount.set(s.accountKey, [...(byAccount.get(s.accountKey) ?? []), s]);

  for (const group of Array.from(byAccount.values())) {
    const sorted = [...group].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevMonth = monthOf(prev.periodEnd);
      const curMonth = monthOf(cur.periodEnd);

      if (cur.periodStart <= prev.periodEnd) {
        issues.push({
          kind: "overlap",
          level: "warn",
          message: `${monthName(prevMonth)} and ${monthName(curMonth)} statements for the account ending ${cur.accountLast4} cover overlapping dates.`,
          statementIds: [prev.id, cur.id],
        });
        continue;
      }

      const missing: string[] = [];
      for (let m = nextMonth(prevMonth); monthIndex(m) < monthIndex(curMonth); m = nextMonth(m)) missing.push(m);
      if (missing.length) {
        const names = missing.map(monthName).join(", ");
        issues.push({
          kind: "gap",
          level: "error",
          message: `Missing ${missing.length === 1 ? "statement" : "statements"} for ${names} on the account ending ${cur.accountLast4}, between ${monthName(prevMonth)} and ${monthName(curMonth)}.`,
          statementIds: [prev.id, cur.id],
          months: missing,
        });
        continue;
      }

      if (prev.closing !== null && cur.opening !== null && prev.closing !== cur.opening) {
        issues.push({
          kind: "mismatch",
          level: "error",
          message: `${monthName(prevMonth)} closes at ${fmtRM(prev.closing)} but ${monthName(curMonth)} opens at ${fmtRM(cur.opening)} (difference ${fmtRM(cur.opening - prev.closing)}).`,
          statementIds: [prev.id, cur.id],
        });
      }
    }
  }

  // Same bank, different account number: could be a second account or a changed number, so ask.
  const banks = new Map<string, Set<string>>();
  for (const s of statements) banks.set(s.bank, (banks.get(s.bank) ?? new Set()).add(s.accountKey));
  for (const [bank, keys] of Array.from(banks.entries())) {
    if (keys.size < 2) continue;
    const ids = statements.filter((s) => s.bank === bank).map((s) => s.id);
    const last4s = Array.from(new Set(statements.filter((s) => s.bank === bank).map((s) => s.accountLast4)));
    issues.push({
      kind: "account-changed",
      level: "info",
      message: `This client has ${bank} statements for more than one account number (ending ${last4s.join(", ")}). Check whether the account number changed or these are separate accounts.`,
      statementIds: ids,
    });
  }
  return issues;
}
