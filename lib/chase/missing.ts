import { BANK_STATEMENT_KIND, RECURRING_CATEGORIES, RECURRING_LOOKBACK_MONTHS, RECURRING_MIN_MONTHS } from "../config";
import { monthOf } from "../money";
import type { AppState } from "../types";

export interface MissingItem {
  kind: string;
  seenIn: string[]; // earlier months it arrived in
}

function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// What the client has sent for a month: history items, recurring-category documents dated in that month,
// and a bank statement when a statement for that month is loaded.
export function receivedKinds(state: AppState, clientId: string, month: string): Set<string> {
  const kinds = new Set<string>();
  for (const h of state.history) if (h.clientId === clientId && h.month === month) kinds.add(h.kind);
  for (const b of state.bills) {
    if (b.clientId === clientId && monthOf(b.date) === month && RECURRING_CATEGORIES.includes(b.account)) kinds.add(b.account);
  }
  for (const s of state.statements) if (s.clientId === clientId && monthOf(s.periodEnd) === month) kinds.add(BANK_STATEMENT_KIND);
  return kinds;
}

// Kinds the client normally sends: seen in at least RECURRING_MIN_MONTHS of the previous RECURRING_LOOKBACK_MONTHS months.
export function recurringKinds(state: AppState, clientId: string, month: string): MissingItem[] {
  const prev: string[] = [];
  let m = month;
  for (let i = 0; i < RECURRING_LOOKBACK_MONTHS; i++) {
    m = previousMonth(m);
    prev.push(m);
  }
  const received = prev.map((p) => ({ month: p, kinds: receivedKinds(state, clientId, p) }));
  const out: MissingItem[] = [];
  for (const kind of [...RECURRING_CATEGORIES, BANK_STATEMENT_KIND]) {
    const seenIn = received.filter((r) => r.kinds.has(kind)).map((r) => r.month);
    if (seenIn.length >= RECURRING_MIN_MONTHS) out.push({ kind, seenIn });
  }
  return out;
}

// Recurring kinds that have not arrived for the month and were not marked "Not needed this month".
export function missingDocuments(state: AppState, clientId: string, month: string): MissingItem[] {
  const waived = state.months[`${clientId}:${month}`]?.waived ?? [];
  const got = receivedKinds(state, clientId, month);
  return recurringKinds(state, clientId, month).filter((i) => !got.has(i.kind) && !waived.includes(i.kind));
}
