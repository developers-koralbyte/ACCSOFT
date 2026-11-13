import type { AppState } from "../types";
import type { MonthRecord } from "./types";

export const monthKey = (clientId: string, month: string) => `${clientId}:${month}`;

export function getMonth(state: AppState, clientId: string, month: string): MonthRecord {
  return state.months[monthKey(clientId, month)] ?? { clientId, month, waived: [], ackTotalsOnly: [], history: [] };
}

// Pure: returns a new state with the month record replaced.
export function setMonth(state: AppState, rec: MonthRecord): AppState {
  return { ...state, months: { ...state.months, [monthKey(rec.clientId, rec.month)]: rec } };
}

export function updateMonth(state: AppState, clientId: string, month: string, fn: (r: MonthRecord) => MonthRecord): AppState {
  return setMonth(state, fn(getMonth(state, clientId, month)));
}

// An approved month is locked: its snapshot exists until the month is reopened.
export function isMonthLocked(state: AppState, clientId: string, month: string): boolean {
  return Boolean(state.months[monthKey(clientId, month)]?.snapshot);
}
