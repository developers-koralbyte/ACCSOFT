import type { RawModelSuggestion } from "./model";

// Server side. Asks the model for matches the rules could not make. Used only when a key is set.
// The answer is validated in code before anything is shown, and nothing is ever applied automatically.

const PROMPT = `You help an accountant match bank payments to supplier documents. Amounts are integer sen (100 sen = RM1).
You get "lines" (unmatched bank payments) and "documents" (unpaid supplier documents).
Suggest ONLY matches you are fairly sure of. Three kinds are allowed:
- "one": one document paid by one payment (amounts equal).
- "many-invoices": one payment that covers SEVERAL documents of the same payee. The document totals must add up EXACTLY to the payment.
- "part-payment": one document paid in parts. This payment is smaller than the document total and the payee is clearly the same.
Never invent ids. Use only the line keys and document ids given. Each document may appear in at most one suggestion.
Return ONLY a JSON array of { key, billIds, kind, reason, category, taxCode } where reason is one short plain sentence,
category and taxCode are taken from the document. No commentary.`;

export async function liveMatchSuggestions(payload: unknown): Promise<RawModelSuggestion[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 3000,
      messages: [{ role: "user", content: `${PROMPT}\n\n${JSON.stringify(payload)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Match suggestions failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text: string = (json.content || []).map((c: { text?: string }) => c.text || "").join("");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) ? (parsed as RawModelSuggestion[]) : [];
}
