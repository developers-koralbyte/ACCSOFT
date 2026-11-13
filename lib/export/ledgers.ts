export type LedgerId = "xero" | "quickbooks" | "sqlaccount" | "autocount" | "zoho" | "other";

export interface LedgerInfo {
  id: LedgerId;
  label: string;
  // true when the import layout has NOT been verified against the vendor's own template
  draft: boolean;
}

export const LEDGERS: LedgerInfo[] = [
  { id: "xero", label: "Xero", draft: false },
  { id: "quickbooks", label: "QuickBooks", draft: false },
  { id: "sqlaccount", label: "SQL Account", draft: true },
  { id: "autocount", label: "AutoCount", draft: true },
  { id: "zoho", label: "Zoho Books", draft: true },
  { id: "other", label: "Other", draft: false },
];

export const DRAFT_LABEL = "Draft template: verify before use";
export const DRAFT_FILE_TAG = "DRAFT-template-verify-before-use";

export function ledgerInfo(id: LedgerId | undefined): LedgerInfo {
  return LEDGERS.find((l) => l.id === id) ?? LEDGERS[0];
}
