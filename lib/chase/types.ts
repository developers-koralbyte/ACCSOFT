export type Lang = "en" | "ms" | "zh";

// Whether a question has been sent. Answers are kept on the line decision, so the audit trail stays with the line.
export interface QuestionRecord {
  key: string; // statementId:lineId
  sentAt: string;
  sentBy: string;
}

// What a client sent in earlier months. In the demo this is seeded; a real build would read the document store.
export interface HistoryItem {
  clientId: string;
  month: string; // YYYY-MM
  kind: string; // a recurring category, or "Bank statement"
  label: string;
}

// A chase message that was opened for a client, per month.
export interface ChaseRecord {
  clientId: string;
  month: string;
  at: string;
  by: string;
}
