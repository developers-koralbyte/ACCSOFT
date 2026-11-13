import { addActivity } from "../activity";
import { missingDocuments, type MissingItem } from "../chase/missing";
import { monthName, monthOf } from "../money";
import { proveStatement } from "../statements/proof";
import type { Statement } from "../statements/types";
import type { Staff } from "../staff";
import type { AppState } from "../types";
import { getMonth, setMonth, updateMonth } from "./records";
import { buildSnapshot, reconcileForClient } from "./snapshot";
import type { MonthRecord } from "./types";

export interface Check {
  id: "statement" | "proven" | "reconciled" | "questions";
  ok: boolean;
  text: string; // plain words, shown next to the tick or cross
  missing?: string; // what is missing, when not ok
}

export interface Readiness {
  statements: Statement[];
  checks: Check[];
  missing: string[]; // everything that blocks approval, in words
  outstandingDocs: MissingItem[]; // documents still missing and not marked "Not needed this month"
  totalsOnlyPending: Statement[];
  ready: boolean; // statements, reconciliation and questions are all fine (documents are handled by an acknowledgement)
}

// What must be true before a month can be approved. Derived from the data every time.
export function readiness(state: AppState, clientId: string, month: string): Readiness {
  const rec = getMonth(state, clientId, month);
  const statements = state.statements.filter((s) => s.clientId === clientId && monthOf(s.periodEnd) === month);
  const checks: Check[] = [];
  const name = monthName(month);

  if (statements.length === 0) {
    checks.push({ id: "statement", ok: false, text: "A statement for the month has arrived", missing: `No bank statement for ${name} has arrived` });
    return { statements, checks, missing: [`No bank statement for ${name} has arrived`], outstandingDocs: missingDocuments(state, clientId, month), totalsOnlyPending: [], ready: false };
  }
  checks.push({ id: "statement", ok: true, text: `${statements.length} ${statements.length === 1 ? "statement" : "statements"} for ${name}` });

  // proven, or totals only with the warning acknowledged
  const problems: string[] = [];
  const totalsOnlyPending: Statement[] = [];
  for (const s of statements) {
    const p = proveStatement(s);
    if (p.status === "break") problems.push(`${s.fileName} has a break: ${p.label.toLowerCase()}`);
    else if (p.status === "incomplete") problems.push(`${s.fileName} needs its opening and closing balance`);
    else if (p.status === "totals-only" && !rec.ackTotalsOnly.includes(s.id)) {
      problems.push(`Acknowledge that ${s.fileName} is proven on totals only, so single lines were not proven`);
      totalsOnlyPending.push(s);
    }
  }
  checks.push({ id: "proven", ok: problems.length === 0, text: "Every statement is proven", missing: problems.join("; ") || undefined });

  const recon = reconcileForClient(state, clientId);
  let suggested = 0;
  let toConfirm = 0;
  let unexplained = 0;
  const notReconciled: string[] = [];
  for (const s of statements) {
    const sum = recon.summaries.get(s.id);
    if (!sum || sum.blocked) continue;
    suggested += sum.counts.suggested;
    toConfirm += sum.bankOnlyToConfirm;
    unexplained += sum.counts.unexplained;
  }
  if (suggested) notReconciled.push(`${suggested} suggested ${suggested === 1 ? "line" : "lines"} to accept or reject`);
  if (toConfirm) notReconciled.push(`${toConfirm} bank only ${toConfirm === 1 ? "line" : "lines"} to confirm`);
  const blocked = statements.some((s) => recon.summaries.get(s.id)?.blocked);
  if (blocked) notReconciled.push("a statement that is not proven cannot be matched");
  checks.push({ id: "reconciled", ok: notReconciled.length === 0, text: "Every statement is Reconciled", missing: notReconciled.join("; ") || undefined });
  checks.push({ id: "questions", ok: unexplained === 0, text: "No questions are open", missing: unexplained ? `${unexplained} ${unexplained === 1 ? "question is" : "questions are"} open (unexplained ${unexplained === 1 ? "line" : "lines"})` : undefined });

  const missing = checks.filter((c) => !c.ok).map((c) => c.missing as string);
  return { statements, checks, missing, outstandingDocs: missingDocuments(state, clientId, month), totalsOnlyPending, ready: missing.length === 0 };
}

export type SignoffResult = { ok: true; state: AppState } | { ok: false; reasons: string[] };

const fail = (...reasons: string[]): SignoffResult => ({ ok: false, reasons });

export function approvalStatus(rec: MonthRecord): "approved" | "prepared" | "open" {
  return rec.reviewed && rec.snapshot ? "approved" : rec.prepared ? "prepared" : "open";
}

// Step 1: "Prepared by". Needs the same conditions as approval, except the second person and the documents acknowledgement.
export function prepareMonth(state: AppState, clientId: string, month: string, by: Staff, at = new Date().toISOString()): SignoffResult {
  const rec = getMonth(state, clientId, month);
  if (approvalStatus(rec) === "approved") return fail("This month is already approved.");
  const r = readiness(state, clientId, month);
  if (!r.ready) return fail(...r.missing);
  const next = updateMonth(state, clientId, month, (m) => ({
    ...m,
    prepared: { staffId: by.id, name: by.name, at },
    history: [...m.history, { at, by: by.name, kind: "prepared", text: "Prepared" }],
  }));
  return { ok: true, state: addActivity(next, { clientId, month, by: by.name, kind: "prepared", text: `Prepared ${monthName(month)} for review`, at }) };
}

// What stops the Approve button right now. Empty means it can be pressed.
export function approvalBlockers(state: AppState, clientId: string, month: string, by: Staff, ackOutstanding: boolean, singleStep = false): string[] {
  const rec = getMonth(state, clientId, month);
  if (approvalStatus(rec) === "approved") return ["This month is already approved."];
  const r = readiness(state, clientId, month);
  const out = [...r.missing];
  if (!singleStep) {
    if (!rec.prepared) out.push("Step 1 is not done: someone must mark the month as prepared first");
    else if (rec.prepared.staffId === by.id) out.push(`Reviewed by must be a different person from Prepared by (${rec.prepared.name}). Switch person in the top bar`);
  }
  if (r.outstandingDocs.length > 0 && !ackOutstanding) {
    out.push(`${r.outstandingDocs.length} ${r.outstandingDocs.length === 1 ? "document is" : "documents are"} still outstanding: tick the acknowledgement, or mark ${r.outstandingDocs.length === 1 ? "it" : "them"} "Not needed this month"`);
  }
  return out;
}

// Step 2 (or the single step in business mode): approve, store the snapshot, lock the month.
export function approveMonth(
  state: AppState,
  clientId: string,
  month: string,
  by: Staff,
  opts: { ackOutstanding: boolean; singleStep?: boolean; at?: string },
): SignoffResult {
  const at = opts.at ?? new Date().toISOString();
  const blockers = approvalBlockers(state, clientId, month, by, opts.ackOutstanding, opts.singleStep);
  if (blockers.length) return fail(...blockers);
  const snapshot = buildSnapshot(state, clientId, month, at);
  const outstanding = snapshot.outstandingDocs;
  const next = updateMonth(state, clientId, month, (m) => ({
    ...m,
    prepared: m.prepared ?? { staffId: by.id, name: by.name, at },
    reviewed: { staffId: by.id, name: by.name, at },
    outstandingAcknowledged: outstanding > 0 ? outstanding : undefined,
    snapshot,
    history: [
      ...m.history,
      { at, by: by.name, kind: "approved", text: outstanding > 0 ? `Approved with ${outstanding} ${outstanding === 1 ? "document" : "documents"} outstanding` : "Approved" },
    ],
  }));
  const text = outstanding > 0 ? `Approved with ${outstanding} ${outstanding === 1 ? "document" : "documents"} outstanding (${snapshot.missingDocs.join(", ")})` : `Approved ${monthName(month)}`;
  return { ok: true, state: addActivity(next, { clientId, month, by: by.name, kind: "approval", text, at }) };
}

// Reopening needs a reason. It removes the lock and the snapshot, and the reason is logged.
export function reopenMonth(state: AppState, clientId: string, month: string, by: Staff, reason: string, at = new Date().toISOString()): SignoffResult {
  const why = reason.trim();
  if (!why) return fail("Give a reason for reopening this month.");
  const rec = getMonth(state, clientId, month);
  if (!rec.snapshot && !rec.prepared) return fail("This month is not approved or prepared.");
  const next = setMonth(state, {
    ...rec,
    prepared: undefined,
    reviewed: undefined,
    snapshot: undefined,
    outstandingAcknowledged: undefined,
    history: [...rec.history, { at, by: by.name, kind: "reopened", text: `Reopened: ${why}` }],
  });
  return { ok: true, state: addActivity(next, { clientId, month, by: by.name, kind: "reopened", text: `Reopened ${monthName(month)}. Reason: ${why}`, at }) };
}

export function acknowledgeTotalsOnly(state: AppState, clientId: string, month: string, statementId: string, by: Staff, at = new Date().toISOString()): AppState {
  const s = state.statements.find((x) => x.id === statementId);
  const next = updateMonth(state, clientId, month, (m) => ({ ...m, ackTotalsOnly: Array.from(new Set([...m.ackTotalsOnly, statementId])) }));
  return addActivity(next, { clientId, month, by: by.name, kind: "acknowledged", text: `Acknowledged that ${s?.fileName ?? "a statement"} is proven on totals only: single lines were not proven`, at });
}

// Optional balance per books, typed in from the accountant's ledger. Blank (null) removes it. Not allowed once approved.
export function setBooksBalance(state: AppState, clientId: string, month: string, statementId: string, sen: number | null, by: Staff, at = new Date().toISOString()): AppState {
  if (getMonth(state, clientId, month).snapshot) return state;
  const s = state.statements.find((x) => x.id === statementId);
  const next = updateMonth(state, clientId, month, (m) => {
    const books = { ...(m.booksBalance ?? {}) };
    if (sen === null) delete books[statementId];
    else books[statementId] = sen;
    return { ...m, booksBalance: books };
  });
  return addActivity(next, { clientId, month, by: by.name, kind: "books-balance", text: sen === null ? `Cleared the balance per books for ${s?.fileName ?? "a statement"}` : `Entered the balance per books for ${s?.fileName ?? "a statement"}`, at });
}
