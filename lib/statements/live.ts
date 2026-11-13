import type { LivePage } from "./ingest";

// Server side. Used only for a page that has no text layer (a scan or a phone photo), and only when a key is set.
// Digital statements are parsed in the browser and never reach this file.

const PROMPT = `You are reading ONE page of a Malaysian bank statement (English or Bahasa Malaysia).
Return ONLY a JSON object with these keys:
bank (string), accountNumber (string, digits as printed), periodStart (YYYY-MM-DD or empty), periodEnd (YYYY-MM-DD or empty),
opening (string like "1234.56" if an opening or brought forward balance is printed on this page, else null),
closing (string like "1234.56" if a closing or ending balance is printed on this page, else null),
lines: an array, in order, of { date (YYYY-MM-DD, infer the year from the statement period or date), description (string, include wrapped lines),
debit (string like "12.30", money out, empty if none), credit (string, money in, empty if none), balance (string running balance printed after this line, or null) }.
Copy figures exactly as printed. Use plain numbers with two decimals and no currency symbols or thousands separators.
Overdrawn balances are negative. Do not guess a figure that is not legible: leave it null. No commentary.`;

export function liveStatementsAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function livePageExtract(imageBase64: string): Promise<LivePage> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Statement page extraction failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string = (json.content || []).map((c: { text?: string }) => c.text || "").join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Statement page extraction returned no JSON");
  const parsed = JSON.parse(match[0]);
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
  return {
    bank: str(parsed.bank),
    accountNumber: str(parsed.accountNumber),
    periodStart: str(parsed.periodStart),
    periodEnd: str(parsed.periodEnd),
    opening: str(parsed.opening) ?? null,
    closing: str(parsed.closing) ?? null,
    lines: Array.isArray(parsed.lines)
      ? parsed.lines.map((l: Record<string, unknown>) => ({
          date: String(l.date ?? ""),
          description: String(l.description ?? ""),
          debit: str(l.debit),
          credit: str(l.credit),
          balance: str(l.balance) ?? null,
        }))
      : [],
  };
}
