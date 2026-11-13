import { BANK_STATEMENT_KIND, CHASE_GRACE_DAYS, MONTH_CUTOFF_DAY } from "./config";
import { missingDocuments } from "./chase/missing";
import { monthName, monthOf, nextMonth } from "./money";
import { proveStatement } from "./statements/proof";
import type { AppState } from "./types";
import { getMonth } from "./month/records";
import { approvalStatus, readiness } from "./month/signoff";
import { reconcileForClient } from "./month/snapshot";

// The month board. EVERY value here is derived from existing data; nothing about a stage is stored on its own.

export type Stage = "received" | "proven" | "matched" | "answered" | "approved";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "received", label: "Received" },
  { id: "proven", label: "Proven" },
  { id: "matched", label: "Matched" },
  { id: "answered", label: "Answered" },
  { id: "approved", label: "Approved" },
];

export type BlockReason = "statement-missing" | "break" | "incomplete";

export interface Cell {
  status: "done" | "progress" | "blocked";
  idle?: boolean; // in progress only because an earlier stage is not finished
  text: string;
  count?: number;
  href: string;
  reason?: BlockReason;
  canChase?: boolean; // Received while waiting for a statement
  chased?: boolean; // the client has already been chased for this month
}

export interface BoardRow {
  clientId: string;
  name: string;
  cells: Record<Stage, Cell>;
  complete: boolean;
  blocked: boolean;
  reasons: BlockReason[];
}

// The statement for a month is due by the cutoff day of the FOLLOWING month, for example 5 November for October.
export function cutoffDate(month: string): string {
  return `${nextMonth(month)}-${String(MONTH_CUTOFF_DAY).padStart(2, "0")}`;
}

export function pastCutoff(month: string, now: Date): boolean {
  return now.toISOString().slice(0, 10) > cutoffDate(month);
}

// The last day of the grace period after a chase. Blocked can only start the day after it.
export function graceEnds(chasedAtIso: string): string {
  const d = new Date(`${chasedAtIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + CHASE_GRACE_DAYS);
  return d.toISOString().slice(0, 10);
}

export function pastGrace(chasedAtIso: string, now: Date): boolean {
  return now.toISOString().slice(0, 10) > graceEnds(chasedAtIso);
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function boardRow(state: AppState, clientId: string, month: string, now: Date): BoardRow {
  const client = state.clients.find((c) => c.id === clientId);
  const q = `client=${clientId}&month=${month}`;
  const rec = getMonth(state, clientId, month);
  const statements = state.statements.filter((s) => s.clientId === clientId && monthOf(s.periodEnd) === month);
  const recon = reconcileForClient(state, clientId);
  const ready = readiness(state, clientId, month);
  const missingDocs = missingDocuments(state, clientId, month);
  const status = approvalStatus(rec);
  const hasStatement = statements.length > 0;

  // Received
  let received: Cell;
  if (!hasStatement) {
    const chased = state.chases[`${clientId}:${month}`];
    if (chased && pastCutoff(month, now) && pastGrace(chased.at, now)) {
      received = { status: "blocked", text: `Statement missing. Chased on ${ddmmyyyy(chased.at)}, grace period over, past the ${MONTH_CUTOFF_DAY}th`, count: 1, href: `/questions?${q}#missing`, reason: "statement-missing", chased: true };
    } else if (chased) {
      received = { status: "progress", text: `Chased on ${ddmmyyyy(chased.at)}, waiting`, count: Math.max(1, missingDocs.length), href: `/questions?${q}#missing`, canChase: true, chased: true };
    } else {
      received = { status: "progress", text: "Waiting for statement", count: Math.max(1, missingDocs.length), href: `/questions?${q}#missing`, canChase: true };
    }
  } else if (missingDocs.length > 0) {
    received = { status: "progress", text: `${plural(missingDocs.length, "document", "documents")} missing`, count: missingDocs.length, href: `/questions?${q}#missing` };
  } else {
    received = { status: "done", text: "Received", href: `/questions?${q}#missing` };
  }

  // Proven
  let proven: Cell;
  const proofs = statements.map((s) => ({ s, p: proveStatement(s) }));
  const breaks = proofs.filter((x) => x.p.status === "break");
  const incomplete = proofs.filter((x) => x.p.status === "incomplete");
  const totalsPending = proofs.filter((x) => x.p.status === "totals-only" && !rec.ackTotalsOnly.includes(x.s.id));
  if (!hasStatement) proven = { status: "progress", idle: true, text: "Needs a statement", href: `/statements?client=${clientId}` };
  else if (breaks.length) proven = { status: "blocked", text: `${plural(breaks.length, "statement", "statements")} with a break: ${breaks[0].p.label}`, count: breaks.length, href: `/statements?client=${clientId}`, reason: "break" };
  else if (incomplete.length) proven = { status: "blocked", text: "Opening or closing balance missing", count: incomplete.length, href: `/statements?client=${clientId}`, reason: "incomplete" };
  else if (totalsPending.length) proven = { status: "progress", text: `Totals only: ${plural(totalsPending.length, "warning", "warnings")} to acknowledge`, count: totalsPending.length, href: `/month?${q}` };
  else proven = { status: "done", text: "Proven to the cent", href: `/statements?client=${clientId}` };

  // Matched and Answered
  let toReview = 0;
  let unexplained = 0;
  let unexplainedNotSent = 0;
  let answered = 0;
  let matchable = false;
  for (const s of statements) {
    const sum = recon.summaries.get(s.id);
    if (!sum || sum.blocked) continue;
    matchable = true;
    toReview += sum.counts.suggested + sum.bankOnlyToConfirm;
    unexplained += sum.counts.unexplained;
    answered += sum.counts.answered;
    for (const l of s.lines) {
      const r = recon.results.get(`${s.id}:${l.id}`);
      if (r?.state === "unexplained" && !state.questions[r.key]) unexplainedNotSent++;
    }
  }
  const matched: Cell = !matchable
    ? { status: "progress", idle: true, text: hasStatement ? "Needs a proven statement" : "Needs a statement", href: `/statements?client=${clientId}` }
    : toReview > 0
      ? { status: "progress", text: `${toReview} to review`, count: toReview, href: `/statements?client=${clientId}` }
      : { status: "done", text: "All matched and confirmed", href: `/statements?client=${clientId}` };
  const answeredCell: Cell = !matchable
    ? { status: "progress", idle: true, text: hasStatement ? "Needs a proven statement" : "Needs a statement", href: `/questions?${q}` }
    : unexplained > 0
      ? {
          status: "progress",
          text: unexplainedNotSent === unexplained ? `${plural(unexplained, "question", "questions")} open, not sent` : `${plural(unexplained, "question", "questions")} open, ${unexplained - unexplainedNotSent} sent`,
          count: unexplained,
          href: `/questions?${q}`,
        }
      : { status: "done", text: answered > 0 ? `${plural(answered, "line", "lines")} answered` : "Nothing to ask", href: `/questions?${q}` };

  // Approved
  let approved: Cell;
  if (status === "approved") approved = { status: "done", text: `Approved by ${rec.reviewed?.name}, prepared by ${rec.prepared?.name}`, href: `/month?${q}` };
  else if (received.status === "blocked" || proven.status === "blocked") approved = { status: "blocked", text: "Waiting on the blocked stage", href: `/month?${q}`, reason: received.reason ?? proven.reason };
  else if (status === "prepared") approved = { status: "progress", text: `Prepared by ${rec.prepared?.name}, awaiting review`, href: `/month?${q}` };
  else if (ready.ready) approved = { status: "progress", text: "Ready to prepare and approve", href: `/month?${q}` };
  else approved = { status: "progress", idle: true, text: `Not ready: ${ready.missing.length} ${ready.missing.length === 1 ? "thing" : "things"} to do`, count: ready.missing.length, href: `/month?${q}` };

  const cells: Record<Stage, Cell> = { received, proven, matched, answered: answeredCell, approved };
  const reasons = Object.values(cells).map((c) => c.reason).filter((r): r is BlockReason => Boolean(r));
  return {
    clientId,
    name: client?.name ?? clientId,
    cells,
    complete: approved.status === "done",
    blocked: Object.values(cells).some((c) => c.status === "blocked"),
    reasons: Array.from(new Set(reasons)),
  };
}

const REASON_TEXT: Record<BlockReason, string> = {
  "statement-missing": "statement still missing after chase",
  break: "a statement has a break in its balance",
  incomplete: "a statement is missing its opening or closing balance",
};

export interface BoardSummary {
  complete: number;
  total: number;
  blocked: number;
  headline: string;
  blockedLine: string; // empty when nothing is blocked
}

export function boardSummary(rows: BoardRow[], month: string): BoardSummary {
  const complete = rows.filter((r) => r.complete).length;
  const blockedRows = rows.filter((r) => r.blocked);
  const monthWord = monthName(month).split(" ")[0];
  let blockedLine = "";
  if (blockedRows.length > 0) {
    const counts = new Map<BlockReason, string[]>();
    for (const r of blockedRows) for (const reason of r.reasons) counts.set(reason, [...(counts.get(reason) ?? []), r.name]);
    const main = Array.from(counts.entries()).sort((a, b) => b[1].length - a[1].length)[0];
    blockedLine = `${blockedRows.length} blocked. Main reason: ${main ? REASON_TEXT[main[0]] : "a stage is blocked"}${main ? ` (${main[1].slice(0, 2).join(", ")}${main[1].length > 2 ? ` and ${main[1].length - 2} more` : ""})` : ""}.`;
  }
  return { complete, total: rows.length, blocked: blockedRows.length, headline: `${complete} of ${rows.length} clients complete for ${monthWord}`, blockedLine };
}

export function boardRows(state: AppState, month: string, now: Date, clientIds?: string[]): BoardRow[] {
  return (clientIds ?? state.clients.map((c) => c.id)).map((id) => boardRow(state, id, month, now));
}

export { BANK_STATEMENT_KIND };
