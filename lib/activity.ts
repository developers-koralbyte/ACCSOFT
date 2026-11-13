import type { AppState } from "./types";

export type ActivityKind =
  | "correction"
  | "accepted"
  | "rejected"
  | "category-confirmed"
  | "linked"
  | "bank-only"
  | "undo"
  | "statement-added"
  | "statement-removed"
  | "question-sent"
  | "answer"
  | "chase"
  | "waived"
  | "acknowledged"
  | "prepared"
  | "approval"
  | "reopened"
  | "books-balance"
  | "file-removed"
  | "ledger";

export interface ActivityEntry {
  id: string;
  clientId: string;
  month?: string; // YYYY-MM when the action belongs to a month
  at: string; // ISO timestamp
  by: string; // staff member's name
  kind: ActivityKind;
  text: string;
}

let counter = 0;

// Appends one entry to the client's activity log. Pure: returns a new state.
export function addActivity(
  state: AppState,
  entry: { clientId: string; month?: string; by: string; kind: ActivityKind; text: string; at?: string },
): AppState {
  counter++;
  const at = entry.at ?? new Date().toISOString();
  const e: ActivityEntry = { id: `act-${at}-${counter}`, clientId: entry.clientId, month: entry.month, at, by: entry.by, kind: entry.kind, text: entry.text };
  return { ...state, activity: [...state.activity, e] };
}

export function activityFor(state: AppState, clientId: string, month?: string): ActivityEntry[] {
  return state.activity.filter((a) => a.clientId === clientId && (!month || !a.month || a.month === month)).sort((a, b) => (a.at < b.at ? 1 : -1));
}
