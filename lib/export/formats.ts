import { fmtDate, senToPlain } from "../money";
import { toCsv, safeName, type Cell } from "./csv";
import { DRAFT_FILE_TAG, DRAFT_LABEL, ledgerInfo, type LedgerId } from "./ledgers";
import type { ExportLine } from "./lines";
import { presetFor, type FieldId } from "./presets";

// Bank line exports for an approved month, in the client's ledger format.
//
// Xero: the standard bank statement import columns as I know them: *Date, *Amount, Payee, Description, Reference,
//   Cheque Number. Money out is negative. Verify with a test import before relying on it.
// QuickBooks: the standard 3 column (Date, Description, Amount) or 4 column (Date, Description, Credit, Debit) layout.
//   Dates are DD/MM/YYYY, the Malaysian setting. Verify against your QuickBooks region setting.
// SQL Account, AutoCount, Zoho Books: DRAFT presets (lib/export/presets.ts). Not verified, labelled as such.
// Other: one generic CSV with every field.

export interface ExportFile {
  fileName: string;
  csv: string;
  draft: boolean;
  label: string; // shown next to the download button
  note: string;
}

const plain = (sen: number) => senToPlain(sen);
const money = (sen: number) => (sen === 0 ? "" : plain(sen));

export function xeroStatementCsv(lines: ExportLine[]): string {
  const rows: Cell[][] = [["*Date", "*Amount", "Payee", "Description", "Reference", "Cheque Number"]];
  for (const l of lines) rows.push([fmtDate(l.date), plain(l.amount), l.payee, l.description, l.reference, ""]);
  return toCsv(rows);
}

export function quickbooksCsv(lines: ExportLine[], layout: 3 | 4): string {
  if (layout === 3) {
    const rows: Cell[][] = [["Date", "Description", "Amount"]];
    for (const l of lines) rows.push([fmtDate(l.date), l.description, plain(l.amount)]);
    return toCsv(rows);
  }
  const rows: Cell[][] = [["Date", "Description", "Credit", "Debit"]];
  for (const l of lines) rows.push([fmtDate(l.date), l.description, money(l.credit), money(l.debit)]);
  return toCsv(rows);
}

// Every field, for "Other" and for the audit pack.
export function genericCsv(lines: ExportLine[]): string {
  const rows: Cell[][] = [[
    "Statement account", "Line", "Date", "Description", "Money out", "Money in", "Amount (in positive, out negative)", "Running balance",
    "State", "Category", "Category confirmed", "Tax code", "Tax rate in force", "Payee", "Document reference", "Matched documents", "Rule or person", "Client answer",
  ]];
  for (const l of lines) {
    rows.push([
      `${l.bank} ending ${l.accountLast4}`, l.lineNo, fmtDate(l.date), l.description, money(l.debit), money(l.credit), plain(l.amount),
      l.balance === null ? "" : plain(l.balance), l.stateLabel, l.category, l.confirmed ? "Yes" : "No", l.taxCode, l.taxRate, l.payee, l.reference, l.documents, l.basis, l.answer,
    ]);
  }
  return toCsv(rows);
}

function fieldValue(l: ExportLine, f: FieldId): Cell {
  switch (f) {
    case "date": return fmtDate(l.date);
    case "description": return l.description;
    case "payee": return l.payee;
    case "reference": return l.reference;
    case "debit": return money(l.debit);
    case "credit": return money(l.credit);
    case "amount": return plain(l.amount);
    case "category": return l.category;
    case "taxCode": return l.taxCode;
    case "documents": return l.documents;
    case "basis": return l.basis;
  }
}

export function presetCsv(id: string, lines: ExportLine[]): string {
  const p = presetFor(id);
  if (!p) throw new Error(`No preset for ${id}`);
  const rows: Cell[][] = [p.columns.map((c) => c.header)];
  for (const l of lines) rows.push(p.columns.map((c) => fieldValue(l, c.field)));
  return toCsv(rows);
}

export function exportBankLines(ledger: LedgerId, lines: ExportLine[], opts: { clientName: string; month: string; qbLayout?: 3 | 4 }): ExportFile {
  const base = `${safeName(opts.clientName)}-${opts.month}`;
  const info = ledgerInfo(ledger);
  switch (ledger) {
    case "xero":
      return { fileName: `${base}-xero-bank-statement.csv`, csv: xeroStatementCsv(lines), draft: false, label: "Xero bank statement CSV", note: "Import under Bank accounts, Import a statement. Money out is negative." };
    case "quickbooks": {
      const layout = opts.qbLayout ?? 3;
      return { fileName: `${base}-quickbooks-${layout}-column.csv`, csv: quickbooksCsv(lines, layout), draft: false, label: `QuickBooks bank transactions CSV (${layout} columns)`, note: "Dates are DD/MM/YYYY." };
    }
    case "other":
      return { fileName: `${base}-bank-lines-all-fields.csv`, csv: genericCsv(lines), draft: false, label: "Generic CSV with every field", note: "Every field of every line." };
    default:
      return {
        fileName: `${base}-${ledger}-${DRAFT_FILE_TAG}.csv`,
        csv: presetCsv(ledger, lines),
        draft: true,
        label: `${info.label} CSV`,
        note: `${DRAFT_LABEL}. The columns are a placeholder, not the vendor's real template.`,
      };
  }
}
