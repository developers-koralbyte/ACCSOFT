import { toSen } from "../money";
import { ALL_CATEGORIES } from "./categories";
import { isValidOn } from "../tax";
import type { Bill } from "../types";
import type { ModelKind, ModelSuggestion } from "./types";

// Model suggestions are only ever a proposal. This file never applies one: it prepares the request and,
// more importantly, rejects any suggestion whose numbers do not add up exactly, in sen.

export interface ModelLine {
  key: string;
  date: string;
  description: string;
  debit: number;
}

export function buildModelRequest(lines: ModelLine[], bills: Bill[]) {
  return {
    lines: lines.map((l) => ({ key: l.key, date: l.date, description: l.description, amountSen: l.debit })),
    documents: bills.map((b) => ({
      id: b.id,
      supplier: b.supplier,
      invoiceNo: b.invoiceNo,
      date: b.date,
      totalSen: toSen(b.total),
      category: b.account,
      taxCode: b.taxCode,
    })),
  };
}

export interface RawModelSuggestion {
  key?: unknown;
  billIds?: unknown;
  kind?: unknown;
  reason?: unknown;
  category?: unknown;
  taxCode?: unknown;
}

// Keeps only suggestions that are safe to show. Dropped silently: unknown lines or documents, documents already used,
// a document used twice, and any sum that is not exact.
export function validateModelSuggestions(
  raw: RawModelSuggestion[],
  lines: ModelLine[],
  bills: Bill[],
  alreadyUsed: Set<string>,
): ModelSuggestion[] {
  const lineByKey = new Map(lines.map((l) => [l.key, l]));
  const billById = new Map(bills.map((b) => [b.id, b]));
  const usedHere = new Set<string>();
  const seenLines = new Set<string>();
  const out: ModelSuggestion[] = [];

  for (const r of raw) {
    const key = typeof r.key === "string" ? r.key : "";
    const line = lineByKey.get(key);
    if (!line || seenLines.has(key) || !Array.isArray(r.billIds) || r.billIds.length === 0) continue;
    const ids = (r.billIds as unknown[]).filter((x): x is string => typeof x === "string");
    if (ids.length !== r.billIds.length || new Set(ids).size !== ids.length) continue;
    const docs = ids.map((id) => billById.get(id));
    if (docs.some((d) => !d) || ids.some((id) => alreadyUsed.has(id) || usedHere.has(id))) continue;
    const total = (docs as Bill[]).reduce((a, d) => a + toSen(d.total), 0);

    let kind: ModelKind;
    if (ids.length > 1) {
      kind = "many-invoices";
      if (total !== line.debit) continue; // several invoices must add up exactly to the payment
    } else if (total === line.debit) {
      kind = "one";
    } else if (total > line.debit && line.debit > 0) {
      kind = "part-payment"; // the invoice is larger than this payment, so this pays part of it
    } else continue;

    const first = docs[0] as Bill;
    const category = typeof r.category === "string" && ALL_CATEGORIES.includes(r.category) ? r.category : first.account;
    const wanted = typeof r.taxCode === "string" ? r.taxCode : first.taxCode;
    const taxCode = isValidOn(wanted, line.date) ? wanted : isValidOn(first.taxCode, line.date) ? first.taxCode : "NONE";
    ids.forEach((id) => usedHere.add(id));
    seenLines.add(key);
    out.push({
      key,
      billIds: ids,
      kind,
      reason: typeof r.reason === "string" && r.reason.trim() ? r.reason.trim().slice(0, 300) : "Suggested by the model.",
      category,
      taxCode,
    });
  }
  return out;
}
