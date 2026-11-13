import type { Statement } from "./statements/types";
import type { LineDecision, ModelSuggestion, PayeeMemory } from "./match/types";
import type { ActivityEntry } from "./activity";
import type { ChaseRecord, HistoryItem, Lang, QuestionRecord } from "./chase/types";
import type { MonthRecord } from "./month/types";
import type { LedgerId } from "./export/ledgers";

export type Source = "whatsapp" | "upload" | "email";
export type BillStatus = "pending" | "approved" | "posted";

export interface Client {
  id: string;
  name: string;
  phone: string; // international format, digits only, used for WhatsApp reminders
  docsExpected: number; // documents expected this month
  docsReceived: number;
  lastReminder?: string;
  language?: Lang; // language for WhatsApp messages, English when not set
  ledger?: LedgerId; // the accounting software this client uses, for exports
  fyEndMonth?: number; // financial year end month, 1 to 12, December when not set
}

export interface Bill {
  id: string;
  clientId: string;
  supplier: string;
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  taxCode: string;
  account: string;
  description: string;
  confidence: number; // 0 to 1
  source: Source;
  status: BillStatus;
  fileName?: string;
  sentBy?: string; // who sent the document in the WhatsApp chat, when known
  postedRef?: string;
  sample?: boolean; // clearly labelled sample document, removable with Clear samples
}

export interface ExtractedBill {
  supplier: string;
  invoiceNo: string;
  date: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  description: string;
  confidence: number;
}

export interface AppState {
  clients: Client[];
  bills: Bill[];
  statements: Statement[];
  decisions: Record<string, LineDecision>; // a person's actions on bank lines, keyed statementId:lineId
  memory: PayeeMemory; // payee memory per client
  modelSuggestions: ModelSuggestion[];
  questions: Record<string, QuestionRecord>; // sent questions, keyed statementId:lineId
  history: HistoryItem[]; // what clients sent in earlier months
  chases: Record<string, ChaseRecord>; // missing-document chases, keyed clientId:month
  months: Record<string, MonthRecord>; // per client and month: waived documents, acknowledgements, sign-off, snapshot
  activity: ActivityEntry[];
}
