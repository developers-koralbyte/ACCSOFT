import { findDuplicate } from "./continuity";
import type { ParsedStatement } from "./parse";
import type { Statement, StatementKind } from "./types";
import { fmtDate, fmtRM } from "../money";

// File names often carry the full account number (for example "564940007287_Oct2026.pdf"). Only the last 4 digits are kept.
export function safeFileName(name: string): string {
  return name.replace(/\d{8,}/g, (run) => `****${run.slice(-4)}`);
}

export function toStatement(
  draft: ParsedStatement,
  meta: { clientId: string; fileName: string; kind: StatementKind; layout?: string },
): Statement {
  return {
    ...draft,
    id: crypto.randomUUID(),
    clientId: meta.clientId,
    fileName: safeFileName(meta.fileName),
    kind: meta.kind,
    layout: meta.layout ?? draft.layout,
    addedAt: new Date().toISOString(),
  };
}

// Returns a friendly message when this exact statement is already on file for the client, otherwise null.
export function duplicateMessage(existing: Statement[], candidate: Statement): string | null {
  const dup = findDuplicate(
    existing.filter((s) => s.clientId === candidate.clientId),
    candidate,
  );
  if (!dup) return null;
  return `This looks like a statement you already added: account ending ${dup.accountLast4}, ${fmtDate(dup.periodStart)} to ${fmtDate(dup.periodEnd)}, closing ${dup.closing === null ? "unknown" : fmtRM(dup.closing)}. It was not added a second time.`;
}
