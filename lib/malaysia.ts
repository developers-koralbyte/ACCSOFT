import type { Bill, ExtractedBill } from "./types";
import { TAX_RATES, suggestTaxCodeOn, todayIso } from "./tax";

// Tax codes offered in the review screen. The accountant always confirms the final treatment.
// Rates and effective dates live in lib/tax.ts (one table, date aware).
export const TAX_CODES: { code: string; label: string; rate: number }[] = TAX_RATES.map((r) => ({
  code: r.code,
  label: r.label,
  rate: r.rate,
}));

export const ACCOUNTS: string[] = [
  "Advertising and marketing",
  "Bank charges",
  "Computer and software",
  "Courier and postage",
  "Entertainment",
  "Marketplace and platform fees",
  "Motor vehicle and fuel",
  "Office supplies",
  "Professional fees",
  "Rent",
  "Repairs and maintenance",
  "Telephone and internet",
  "Travel and accommodation",
  "Utilities",
  "General expenses",
];

const KEYWORDS: [RegExp, string][] = [
  [/petronas|shell|petron|caltex|bhp|grab|touch ?n ?go|tng|parking/i, "Motor vehicle and fuel"],
  [/tnb|tenaga|syabas|air selangor|indah water|water/i, "Utilities"],
  [/unifi|telekom|maxis|celcom|digi|u mobile|time dotcom|yes 4g/i, "Telephone and internet"],
  [/shopee|lazada|tiktok shop|zalora|marketplace/i, "Marketplace and platform fees"],
  [/google ads|meta|facebook|instagram|linkedin|advert|marketing/i, "Advertising and marketing"],
  [/microsoft|zoho|xero|adobe|notion|slack|aws|amazon web|digitalocean|github|software|saas/i, "Computer and software"],
  [/poslaju|j&t|dhl|fedex|ninja ?van|gdex|courier|pos malaysia/i, "Courier and postage"],
  [/airasia|malaysia airlines|hotel|agoda|booking\.com|airbnb|flight|mas /i, "Travel and accommodation"],
  [/popular|mr ?diy|stationery|office|printing|kedai/i, "Office supplies"],
  [/audit|advisory|legal|lawyer|consult|secretar|tax agent|accounting/i, "Professional fees"],
  [/rent|sewa|landlord|lease/i, "Rent"],
  [/repair|service centre|maintenance|aircond|plumb/i, "Repairs and maintenance"],
  [/restaurant|cafe|kopitiam|catering|food|makan/i, "Entertainment"],
  [/maybank|cimb|public bank|rhb|hong leong|bank|charge/i, "Bank charges"],
];

export function suggestAccount(supplier: string, description: string): string {
  const text = `${supplier} ${description}`;
  for (const [re, account] of KEYWORDS) {
    if (re.test(text)) return account;
  }
  return "General expenses";
}

export function suggestTaxCode(tax: number, subtotal: number, date: string = todayIso()): string {
  return suggestTaxCodeOn(tax, subtotal, date);
}

export interface Flag {
  level: "warn" | "info";
  text: string;
}

export function flagsFor(bill: Bill, all: Bill[]): Flag[] {
  const flags: Flag[] = [];
  const sum = Math.round((bill.subtotal + bill.tax) * 100) / 100;
  if (Math.abs(sum - bill.total) > 0.05) {
    flags.push({ level: "warn", text: "Subtotal plus tax does not equal the total" });
  }
  if (!bill.invoiceNo.trim()) {
    flags.push({ level: "warn", text: "No invoice number found" });
  }
  if (!bill.supplier.trim()) {
    flags.push({ level: "warn", text: "Supplier name missing" });
  }
  const dup = all.find(
    (b) =>
      b.id !== bill.id &&
      b.clientId === bill.clientId &&
      b.supplier.toLowerCase() === bill.supplier.toLowerCase() &&
      b.invoiceNo &&
      b.invoiceNo === bill.invoiceNo,
  );
  if (dup) flags.push({ level: "warn", text: "Possible duplicate of an existing bill" });
  if (bill.tax > 0 && bill.taxCode === "NONE") {
    flags.push({ level: "info", text: "Tax amount found but tax code is set to none" });
  }
  if (bill.confidence < 0.8) {
    flags.push({ level: "info", text: "Low extraction confidence, check the figures against the document" });
  }
  return flags;
}

export function toBillFields(e: ExtractedBill): Pick<Bill, "taxCode" | "account"> {
  return {
    taxCode: suggestTaxCode(e.tax, e.subtotal, e.date),
    account: suggestAccount(e.supplier, e.description),
  };
}

export function money(n: number, currency = "MYR"): string {
  const symbol = currency === "MYR" ? "RM" : currency + " ";
  return `${symbol}${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
