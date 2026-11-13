import type { Statement } from "./statements/types";

export type Source = "whatsapp" | "upload" | "email";
export type BillStatus = "pending" | "approved" | "posted";

export interface Client {
  id: string;
  name: string;
  phone: string; // international format, digits only, used for WhatsApp reminders
  docsExpected: number; // documents expected this month
  docsReceived: number;
  lastReminder?: string;
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
}
