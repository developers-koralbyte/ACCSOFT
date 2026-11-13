// One table of tax rates with effective dates. No rate is hardcoded anywhere else in the logic.
//
// TODO(owner): VERIFY EVERY RATE AND EFFECTIVE DATE BELOW BEFORE ANY REAL USE.
// These are best-recollection placeholders, not tax advice. In particular check which services are taxed at 6%
// versus 8% (for example telecommunications and logistics services), and any rate changes after the dates shown.
// To change a rate or add a new period, edit this table only.

export interface TaxRate {
  code: string;
  label: string;
  rate: number; // a fraction, for example 0.08
  from: string; // first day this rate applies, YYYY-MM-DD
  to?: string; // last day this rate applies, inclusive. Leave out while still current
}

export const TAX_RATES: TaxRate[] = [
  { code: "NONE", label: "No tax / out of scope", rate: 0, from: "2000-01-01" },
  { code: "SVC6", label: "Service tax 6%", rate: 0.06, from: "2018-09-01" },
  { code: "SVC8", label: "Service tax 8%", rate: 0.08, from: "2024-03-01" },
  { code: "ST10", label: "Sales tax 10%", rate: 0.1, from: "2018-09-01" },
  { code: "ST5", label: "Sales tax 5%", rate: 0.05, from: "2018-09-01" },
];

function inForce(r: TaxRate, date: string): boolean {
  return date >= r.from && (!r.to || date <= r.to);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The rate for a code on a date, or null when that code was not in force on that date.
export function rateOn(code: string, date: string): number | null {
  const r = TAX_RATES.find((x) => x.code === code && inForce(x, date));
  return r ? r.rate : null;
}

export function isValidOn(code: string, date: string): boolean {
  return rateOn(code, date) !== null;
}

// Codes that can be used on a date.
export function codesOn(date: string): TaxRate[] {
  return TAX_RATES.filter((r) => inForce(r, date));
}

export function labelFor(code: string): string {
  return TAX_RATES.find((r) => r.code === code)?.label ?? code;
}

// Picks the code whose rate on that date is closest to tax / subtotal. Falls back to NONE when nothing is close.
export function suggestTaxCodeOn(tax: number, subtotal: number, date: string): string {
  if (!tax || tax <= 0 || !subtotal) return "NONE";
  const rate = tax / subtotal;
  let best = "NONE";
  let bestDiff = Math.abs(rate);
  for (const r of codesOn(date)) {
    const diff = Math.abs(rate - r.rate);
    if (diff < bestDiff) {
      best = r.code;
      bestDiff = diff;
    }
  }
  return bestDiff < 0.012 ? best : "NONE";
}

// A short label for narrow table cells, for example "Service 8%". Built from the rate table.
export function shortLabelFor(code: string): string {
  const r = TAX_RATES.find((x) => x.code === code);
  if (!r) return code;
  if (r.rate === 0) return "No tax";
  return `${code.startsWith("SVC") ? "Service" : "Sales"} ${Math.round(r.rate * 1000) / 10}%`;
}

export interface TaxOption {
  code: string;
  label: string;
  valid: boolean;
}

// The tax codes to offer for a document or bank line dated `date`: only codes in force that day. If the item already
// carries a code that was not valid on its date, it is kept at the end and flagged, so nothing silently changes.
export function taxOptionsFor(date: string, current?: string, short = false): TaxOption[] {
  const options: TaxOption[] = codesOn(date).map((r) => ({ code: r.code, label: short ? shortLabelFor(r.code) : r.label, valid: true }));
  if (current && !options.some((o) => o.code === current)) {
    options.push({ code: current, label: `${short ? shortLabelFor(current) : labelFor(current)} (not valid on this date)`, valid: false });
  }
  return options;
}
