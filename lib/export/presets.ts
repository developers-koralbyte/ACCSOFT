import type { ExportLine } from "./lines";

// COLUMN-MAPPING PRESETS FOR LEDGERS WHOSE IMPORT TEMPLATE HAS NOT BEEN VERIFIED.
//
// These are NOT real vendor templates. The column names and order below are a placeholder guess made so the
// export has a sensible shape. They are labelled "Draft template: verify before use" in the app and in the file name.
// To finalise one, replace its `columns` with the vendor's real template (see docs/DEMO.md for what is needed).
// Each column maps a header to a field of the export line, so changing a template never needs new code.

export type FieldId =
  | "date"
  | "description"
  | "payee"
  | "reference"
  | "debit"
  | "credit"
  | "amount"
  | "category"
  | "taxCode"
  | "documents"
  | "basis";

export interface PresetColumn {
  header: string;
  field: FieldId;
}

export interface Preset {
  id: "sqlaccount" | "autocount" | "zoho";
  columns: PresetColumn[];
  dateFormat: "DD/MM/YYYY";
}

export const DRAFT_PRESETS: Preset[] = [
  {
    id: "sqlaccount",
    dateFormat: "DD/MM/YYYY",
    columns: [
      { header: "Date", field: "date" },
      { header: "Reference", field: "reference" },
      { header: "Description", field: "description" },
      { header: "Account", field: "category" },
      { header: "Tax Code", field: "taxCode" },
      { header: "Debit", field: "debit" },
      { header: "Credit", field: "credit" },
    ],
  },
  {
    id: "autocount",
    dateFormat: "DD/MM/YYYY",
    columns: [
      { header: "Date", field: "date" },
      { header: "Description", field: "description" },
      { header: "Payee", field: "payee" },
      { header: "Reference", field: "reference" },
      { header: "Account", field: "category" },
      { header: "Tax Code", field: "taxCode" },
      { header: "Payment", field: "debit" },
      { header: "Deposit", field: "credit" },
    ],
  },
  {
    id: "zoho",
    dateFormat: "DD/MM/YYYY",
    columns: [
      { header: "Date", field: "date" },
      { header: "Description", field: "description" },
      { header: "Payee", field: "payee" },
      { header: "Reference Number", field: "reference" },
      { header: "Withdrawals", field: "debit" },
      { header: "Deposits", field: "credit" },
      { header: "Account", field: "category" },
      { header: "Tax", field: "taxCode" },
    ],
  },
];

export function presetFor(id: string): Preset | undefined {
  return DRAFT_PRESETS.find((p) => p.id === id);
}

export type FieldReader = (l: ExportLine, field: FieldId) => string;
