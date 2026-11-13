import { COMPANY_SUFFIXES, MONTH_WORDS, NOISE_PHRASES, TRANSFER_WORDS } from "./wordlist";

const NOISE = new Set([...TRANSFER_WORDS, ...COMPANY_SUFFIXES, ...MONTH_WORDS]);

export interface Normalised {
  tokens: string[];
  text: string;
}

// Reduces a bank description or a supplier name to its payee words:
// upper case, transfer wording and company suffixes removed, reference codes (any word with a digit) removed.
export function normalisePayee(input: string): Normalised {
  let s = input.toUpperCase();
  for (const re of NOISE_PHRASES) s = s.replace(re, " ");
  // reference codes are whole whitespace-separated words that contain a digit (SM-2210-003, 8810045512)
  s = s
    .split(/\s+/)
    .filter((t) => !/\d/.test(t))
    .join(" ")
    .replace(/[^A-Z0-9&\s]/g, " ");
  const tokens = s.split(/\s+/).filter((t) => t.length > 1 && !NOISE.has(t));
  return { tokens, text: tokens.join(" ") };
}

// Letters and digits only, upper case: dashes, spaces and case never matter.
export function squash(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const MIN_REF_LENGTH = 5;

// Is this invoice number written in the bank description? Ignores dashes, spaces and letter case on both sides.
export function refMatches(invoiceNo: string, description: string): boolean {
  const ref = squash(invoiceNo);
  if (ref.length < MIN_REF_LENGTH) return false;
  return squash(description).includes(ref);
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((t) => sb.has(t) && inter++);
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Does the bank description name this supplier? Every supplier word must appear, or the overlap must be very high.
export function payeeMatches(supplier: string, description: string): boolean {
  const sup = normalisePayee(supplier).tokens;
  const desc = normalisePayee(description).tokens;
  if (sup.length === 0 || desc.length === 0) return false;
  if (sup.join("").length < 4) return false;
  const set = new Set(desc);
  if (sup.every((t) => set.has(t))) return true;
  return jaccard(sup, desc) >= 0.75;
}
