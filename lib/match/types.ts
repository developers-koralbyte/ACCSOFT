// Matching types. Amounts are integer sen. Matching results are derived; only decisions, memory and
// model suggestions are stored.

export type LineState = "matched" | "suggested" | "bank-only" | "unexplained";
export type RuleId = "reference" | "payee-7d" | "single-3d" | "accepted" | "linked";

// A person's action on one bank line. Never created automatically.
export interface LineDecision {
  billIds?: string[]; // the person accepted, or chose, these documents for the line
  partial?: boolean; // the line pays only part of the document
  bankOnly?: boolean; // the person marked the line as bank only
  category?: string;
  taxCode?: string;
  categoryConfirmed?: boolean; // a person confirmed the category and tax code
  learned?: boolean; // filled from the payee memory after the person approved applying it
  rejected?: string[]; // document ids the person rejected as a suggestion for this line
  at: string;
}

export type ModelKind = "one" | "many-invoices" | "part-payment";

export interface ModelSuggestion {
  key: string;
  billIds: string[];
  kind: ModelKind;
  reason: string;
  category: string;
  taxCode: string;
}

export interface MemoryEntry {
  key: string; // normalised payee words
  payee: string; // shown to the person
  category: string;
  taxCode: string;
  at: string;
}
// client id, then memory key
export type PayeeMemory = Record<string, Record<string, MemoryEntry>>;

export type SuggestSource = "near-miss" | "reference-differs" | "model";

export interface LineResult {
  key: string; // statementId:lineId
  statementId: string;
  lineId: string;
  lineNo: number;
  state: LineState;
  rule?: RuleId;
  ruleLabel: string; // plain words, shown in the UI and the audit pack
  billIds: string[];
  partial?: boolean;
  reason: string;
  suggestSource?: SuggestSource;
  category: string;
  taxCode: string;
  taxWarning?: string;
  categorySource: "bill" | "keyword" | "memory" | "you";
  categoryConfirmed: boolean;
  learned: boolean;
  bankOnlyLabel?: string;
  memoryKey: string;
}

export interface StatementSummary {
  statementId: string;
  blocked?: "break" | "incomplete";
  totalsOnly: boolean;
  counts: Record<LineState, number>;
  bankOnlyToConfirm: number;
  reconciled: boolean;
  outstanding: string[];
}

export interface Reconciliation {
  results: Map<string, LineResult>;
  summaries: Map<string, StatementSummary>;
  consumed: Set<string>; // documents used by a match or an accepted suggestion
}
