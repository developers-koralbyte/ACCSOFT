import { fmtDate, fmtRM, toSen } from "../money";
import { suggestAccount } from "../malaysia";
import { isValidOn, labelFor } from "../tax";
import type { Bill } from "../types";
import { proveStatement } from "../statements/proof";
import type { Statement, StmtLine } from "../statements/types";
import { classifyBankOnly } from "./categories";
import { findMemory } from "./memory";
import { normalisePayee, payeeMatches, refMatches } from "./normalise";
import type {
  LineDecision,
  LineResult,
  MemoryEntry,
  ModelSuggestion,
  Reconciliation,
  RuleId,
  StatementSummary,
  SuggestSource,
} from "./types";

// Matching bank lines to documents.
//
// Deterministic rules, in this order, each pass over every eligible line before the next pass starts:
//   1. exact amount + the document's reference or invoice number written in the bank description
//   2. exact amount + payee name match, within 7 days either side
//   3. exact amount, one candidate in both directions, within 3 days
// A document can be matched once across ALL of a client's statements. Nothing here ever confirms
// anything on a person's behalf: suggestions need a click and bank-only categories need a confirmation.

export const RULE_LABELS: Record<RuleId, string> = {
  reference: "Rule 1: exact amount and invoice reference in the bank description",
  "payee-7d": "Rule 2: exact amount and payee name, within 7 days",
  "single-3d": "Rule 3: exact amount, only one candidate, within 3 days",
  accepted: "Suggestion accepted by you",
  linked: "Document chosen by you",
};

export const NEAR_MISS_DAYS = 31;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

interface Item {
  key: string;
  stmt: Statement;
  line: StmtLine;
  lineNo: number;
  totalsOnly: boolean;
}

export interface ReconcileInput {
  statements: Statement[]; // all of one client's statements
  bills: Bill[]; // all of that client's documents, any status
  decisions: Record<string, LineDecision>;
  memory: Record<string, MemoryEntry>; // that client's payee memory
  modelSuggestions?: ModelSuggestion[];
}

export const lineKey = (statementId: string, lineId: string) => `${statementId}:${lineId}`;

function amountOf(l: StmtLine): number {
  return l.debit > 0 ? l.debit : l.credit;
}

export function reconcileClient(input: ReconcileInput): Reconciliation {
  const { bills, decisions, memory } = input;
  const modelByKey = new Map((input.modelSuggestions ?? []).map((m) => [m.key, m]));
  const billById = new Map(bills.map((b) => [b.id, b]));
  const results = new Map<string, LineResult>();
  const summaries = new Map<string, StatementSummary>();
  const consumed = new Set<string>();

  // Which statements can be matched: proven, or totals only (with a warning). Breaks and incomplete ones are blocked.
  const items: Item[] = [];
  const ordered = [...input.statements].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
  for (const s of ordered) {
    const proof = proveStatement(s);
    if (proof.status === "break" || proof.status === "incomplete") {
      summaries.set(s.id, emptySummary(s.id, proof.status));
      continue;
    }
    s.lines.forEach((line, i) => items.push({ key: lineKey(s.id, line.id), stmt: s, line, lineNo: i + 1, totalsOnly: proof.status === "totals-only" }));
  }

  const rejected = (item: Item, billId: string) => decisions[item.key]?.rejected?.includes(billId) ?? false;

  // ---- the person's own decisions come first ----
  for (const item of items) {
    const d = decisions[item.key];
    if (d?.billIds?.length) {
      const linked = d.billIds.map((id) => billById.get(id)).filter((b): b is Bill => Boolean(b));
      if (linked.length) {
        if (!d.partial) linked.forEach((b) => consumed.add(b.id));
        results.set(item.key, build(item, "matched", memory, decisions, {
          rule: d.partial ? "linked" : "accepted",
          ruleLabel: d.partial ? "Part payment accepted by you" : RULE_LABELS.accepted,
          bills: linked,
          reason: `Accepted by you: ${linked.map(describeBill).join(", ")}.`,
          partial: d.partial,
        }));
      }
    }
  }

  const open = () => items.filter((i) => !results.has(i.key) && i.line.debit > 0 && !decisions[i.key]?.bankOnly);
  const free = (b: Bill) => !consumed.has(b.id);
  const exact = (b: Bill, i: Item) => toSen(b.total) === i.line.debit;
  const nearest = (cands: Bill[], i: Item) =>
    [...cands].sort((a, b) => Math.abs(daysBetween(a.date, i.line.date)) - Math.abs(daysBetween(b.date, i.line.date)))[0];

  const matchWith = (item: Item, bill: Bill, rule: RuleId, reason: string) => {
    consumed.add(bill.id);
    results.set(item.key, build(item, "matched", memory, decisions, { rule, ruleLabel: RULE_LABELS[rule], bills: [bill], reason }));
  };

  // ---- pass 1: amount + reference ----
  for (const item of open()) {
    const c = bills.filter((b) => free(b) && exact(b, item) && !rejected(item, b.id) && refMatches(b.invoiceNo, item.line.description));
    if (c.length) {
      const b = nearest(c, item);
      matchWith(item, b, "reference", `Amount ${fmtRM(item.line.debit)} agrees and invoice ${b.invoiceNo} is written in the bank description.`);
    }
  }

  // ---- pass 2: amount + payee, within 7 days ----
  for (const item of open()) {
    const c = bills.filter(
      (b) => free(b) && exact(b, item) && !rejected(item, b.id) && Math.abs(daysBetween(b.date, item.line.date)) <= 7 && payeeMatches(b.supplier, item.line.description),
    );
    if (c.length) {
      const b = nearest(c, item);
      matchWith(item, b, "payee-7d", `Amount ${fmtRM(item.line.debit)} agrees, payee ${b.supplier} is named, document dated ${fmtDate(b.date)}.`);
    }
  }

  // ---- pass 3: amount only, a single candidate both ways, within 3 days ----
  {
    const candidates = new Map<string, Bill[]>();
    const byBill = new Map<string, string[]>();
    for (const item of open()) {
      const c = bills.filter((b) => free(b) && exact(b, item) && !rejected(item, b.id) && Math.abs(daysBetween(b.date, item.line.date)) <= 3);
      candidates.set(item.key, c);
      c.forEach((b) => byBill.set(b.id, [...(byBill.get(b.id) ?? []), item.key]));
    }
    for (const item of open()) {
      const c = candidates.get(item.key) ?? [];
      if (c.length === 1 && free(c[0]) && byBill.get(c[0].id)?.length === 1) {
        matchWith(item, c[0], "single-3d", `Amount ${fmtRM(item.line.debit)} agrees and ${c[0].supplier} is the only document that fits within 3 days.`);
      }
    }
  }

  // ---- deterministic suggestions: close, but not certain ----
  for (const item of open()) {
    const near = nearMiss(item, bills.filter((b) => free(b) && !rejected(item, b.id)));
    if (near) {
      results.set(item.key, build(item, "suggested", memory, decisions, { bills: [near.bill], ruleLabel: near.label, reason: near.reason, suggestSource: near.source }));
    }
  }

  // ---- model suggestions, saved earlier, for lines nothing else explained ----
  for (const item of open()) {
    if (results.has(item.key)) continue;
    const m = modelByKey.get(item.key);
    if (!m) continue;
    const mb = m.billIds.map((id) => billById.get(id)).filter((b): b is Bill => Boolean(b) && free(b as Bill));
    if (mb.length !== m.billIds.length || mb.some((b) => rejected(item, b.id))) continue;
    const label = m.kind === "many-invoices" ? "Model suggestion: one payment covers several invoices" : m.kind === "part-payment" ? "Model suggestion: invoice paid in part" : "Model suggestion";
    results.set(item.key, build(item, "suggested", memory, decisions, {
      bills: mb,
      ruleLabel: label,
      reason: m.reason,
      suggestSource: "model",
      partial: m.kind === "part-payment",
      modelCategory: { category: m.category, taxCode: m.taxCode },
    }));
  }

  // ---- everything left is bank only or unexplained ----
  for (const item of items) {
    if (results.has(item.key)) continue;
    const side = item.line.debit > 0 ? "debit" : "credit";
    const hit = decisions[item.key]?.bankOnly ? { category: decisions[item.key]?.category ?? "General expenses", label: "Marked bank only by you" } : classifyBankOnly(item.line.description, side);
    if (hit) {
      results.set(item.key, build(item, "bank-only", memory, decisions, {
        ruleLabel: hit.label,
        reason: decisions[item.key]?.bankOnly ? "You marked this line as bank only." : `${hit.label}: explained by the bank, no document needed. The category below is a proposal until you confirm it.`,
        bankCategory: hit.category,
        bankLabel: hit.label,
      }));
    } else {
      results.set(item.key, build(item, "unexplained", memory, decisions, {
        ruleLabel: "No document found",
        reason: side === "debit" ? "No document in the queue fits this payment." : "A receipt with no invoice reference and no document.",
        bankCategory: side === "debit" ? suggestAccount("", item.line.description) : undefined,
      }));
    }
  }

  // ---- summaries ----
  for (const s of ordered) {
    if (summaries.has(s.id)) continue;
    const mine = s.lines.map((l) => results.get(lineKey(s.id, l.id))).filter((r): r is LineResult => Boolean(r));
    const counts = { matched: 0, suggested: 0, "bank-only": 0, unexplained: 0 };
    mine.forEach((r) => counts[r.state]++);
    const toConfirm = mine.filter((r) => r.state === "bank-only" && !r.categoryConfirmed).length;
    const totalsOnly = proveStatement(s).status === "totals-only";
    const outstanding: string[] = [];
    if (counts.suggested) outstanding.push(`${counts.suggested} suggested`);
    if (counts.unexplained) outstanding.push(`${counts.unexplained} unexplained`);
    if (toConfirm) outstanding.push(`${toConfirm} bank only ${toConfirm === 1 ? "line" : "lines"} to confirm`);
    summaries.set(s.id, {
      statementId: s.id,
      totalsOnly,
      counts,
      bankOnlyToConfirm: toConfirm,
      reconciled: outstanding.length === 0 && mine.length > 0,
      outstanding,
    });
  }

  return { results, summaries, consumed };
}

function emptySummary(statementId: string, blocked: "break" | "incomplete"): StatementSummary {
  return {
    statementId,
    blocked,
    totalsOnly: false,
    counts: { matched: 0, suggested: 0, "bank-only": 0, unexplained: 0 },
    bankOnlyToConfirm: 0,
    reconciled: false,
    outstanding: [blocked === "break" ? "Fix the break first" : "Enter the opening and closing balance first"],
  };
}

function describeBill(b: Bill): string {
  return `${b.supplier}${b.invoiceNo ? ` ${b.invoiceNo}` : ""} ${fmtRM(toSen(b.total))}`;
}

// A close but uncertain candidate. Returned only when no rule matched.
function nearMiss(item: Item, bills: Bill[]): { bill: Bill; label: string; reason: string; source: SuggestSource } | null {
  const debit = item.line.debit;
  const byRef = bills.filter((b) => toSen(b.total) !== debit && refMatches(b.invoiceNo, item.line.description));
  if (byRef.length) {
    const b = byRef[0];
    const diff = debit - toSen(b.total);
    return {
      bill: b,
      source: "reference-differs",
      label: "Suggested: invoice reference matches, amount differs",
      reason: `Invoice ${b.invoiceNo} is written in the bank description, but the document is ${fmtRM(toSen(b.total))} and the payment is ${fmtRM(debit)} (${diff > 0 ? "over" : "under"} by ${fmtRM(Math.abs(diff))}).`,
    };
  }
  const near = bills.filter(
    (b) => toSen(b.total) === debit && payeeMatches(b.supplier, item.line.description) && Math.abs(daysBetween(b.date, item.line.date)) <= NEAR_MISS_DAYS,
  );
  if (near.length) {
    const b = [...near].sort((x, y) => Math.abs(daysBetween(x.date, item.line.date)) - Math.abs(daysBetween(y.date, item.line.date)))[0];
    const gap = Math.abs(daysBetween(b.date, item.line.date));
    return {
      bill: b,
      source: "near-miss",
      label: "Suggested: same payee and amount, dates too far apart for a certain match",
      reason: `${b.supplier} and ${fmtRM(debit)} agree, but the document is dated ${fmtDate(b.date)}, ${gap} days from the payment (rules allow 7).`,
    };
  }
  return null;
}

interface BuildExtra {
  rule?: RuleId;
  ruleLabel: string;
  bills?: Bill[];
  reason: string;
  partial?: boolean;
  suggestSource?: SuggestSource;
  bankCategory?: string;
  bankLabel?: string;
  modelCategory?: { category: string; taxCode: string };
}

function build(
  item: Item,
  state: LineResult["state"],
  memory: Record<string, MemoryEntry>,
  decisions: Record<string, LineDecision>,
  x: BuildExtra,
): LineResult {
  const d = decisions[item.key];
  const bills = x.bills ?? [];
  const first = bills[0];
  const date = item.line.date;

  // proposal: from the document, else the model, else the bank-only or keyword rule
  let category = x.modelCategory?.category ?? first?.account ?? x.bankCategory ?? "General expenses";
  let taxCode = x.modelCategory?.taxCode ?? first?.taxCode ?? "NONE";
  let source: LineResult["categorySource"] = first || x.modelCategory ? "bill" : "keyword";

  const payeeTokens = normalisePayee(first ? first.supplier : item.line.description).tokens;
  const lineTokens = Array.from(new Set([...normalisePayee(item.line.description).tokens, ...payeeTokens]));
  const memKey = payeeTokens.join(" ");
  const mem = findMemory(memory, lineTokens);

  let learned = false;
  if (mem) {
    category = mem.category;
    taxCode = mem.taxCode;
    source = "memory";
    learned = true;
  }
  let confirmed = false;
  if (d?.category !== undefined || d?.taxCode !== undefined) {
    category = d.category ?? category;
    taxCode = d.taxCode ?? taxCode;
    source = "you";
    confirmed = Boolean(d.categoryConfirmed);
    learned = Boolean(d.learned);
  }

  const warning = !isValidOn(taxCode, date) ? `${labelFor(taxCode)} was not in force on ${fmtDate(date)}. Pick another tax code.` : undefined;

  return {
    key: item.key,
    statementId: item.stmt.id,
    lineId: item.line.id,
    lineNo: item.lineNo,
    state,
    rule: x.rule,
    ruleLabel: x.ruleLabel,
    billIds: bills.map((b) => b.id),
    partial: x.partial,
    reason: x.reason,
    suggestSource: x.suggestSource,
    category,
    taxCode,
    taxWarning: warning,
    categorySource: source,
    categoryConfirmed: confirmed,
    learned,
    bankOnlyLabel: x.bankLabel,
    memoryKey: memKey || normalisePayee(item.line.description).tokens.join(" "),
  };
}

export { amountOf };
