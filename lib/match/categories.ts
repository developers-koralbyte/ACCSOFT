import { ACCOUNTS } from "../malaysia";

// Categories that only make sense for bank lines, on top of the expense accounts the review queue already uses.
export const EXTRA_CATEGORIES = ["Salaries and wages", "Sales receipts", "Interest income", "Transfers between own accounts"];
export const ALL_CATEGORIES: string[] = [...ACCOUNTS, ...EXTRA_CATEGORIES].sort();

export interface BankOnlyHit {
  category: string;
  kind: "charges" | "interest" | "payroll" | "receipt" | "transfer";
  label: string;
}

const DEBIT_RULES: [RegExp, BankOnlyHit][] = [
  [/SERVICE CHARGE|BANK CHARGE|ACCOUNT FEE|\bFEE\b|COMMISSION|STAMP DUTY|\bCHARGES?\b/i, { category: "Bank charges", kind: "charges", label: "Bank charge" }],
  [/PAYROLL|SALARY|SALARIES|\bGAJI\b|\bEPF\b|KWSP|SOCSO|PERKESO|\bEIS\b|\bPCB\b|LHDN/i, { category: "Salaries and wages", kind: "payroll", label: "Payroll" }],
  [/OWN ACCOUNT|BETWEEN ACCOUNTS|INTER-?ACCOUNT|SAVINGS ACCOUNT|SWEEP/i, { category: "Transfers between own accounts", kind: "transfer", label: "Transfer" }],
];

const CREDIT_RULES: [RegExp, BankOnlyHit][] = [
  [/PROFIT|INTEREST|DIVIDEND|FAEDAH/i, { category: "Interest income", kind: "interest", label: "Interest or profit" }],
  [/OWN ACCOUNT|BETWEEN ACCOUNTS|INTER-?ACCOUNT|SAVINGS ACCOUNT|SWEEP/i, { category: "Transfers between own accounts", kind: "transfer", label: "Transfer" }],
  // A receipt that names an invoice. This is only ever a PROPOSAL: a person must confirm it.
  [/\bINV(OICE)?\b|\bINV[-\s]?[A-Z0-9]/i, { category: "Sales receipts", kind: "receipt", label: "Customer receipt" }],
];

// Is this line something that is explained by the bank itself, with no supporting document needed?
export function classifyBankOnly(description: string, side: "debit" | "credit"): BankOnlyHit | null {
  for (const [re, hit] of side === "debit" ? DEBIT_RULES : CREDIT_RULES) if (re.test(description)) return hit;
  return null;
}
