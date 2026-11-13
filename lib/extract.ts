import type { ExtractedBill } from "./types";

const PROMPT = `You are an accounting assistant for a Malaysian bookkeeping firm. Read this supplier invoice or receipt.
Return ONLY a JSON object with these keys:
supplier (string), invoiceNo (string, empty if none), date (YYYY-MM-DD), currency (ISO code, default MYR),
subtotal (number before tax), tax (number, total SST or other tax), total (number), description (short summary of what was bought),
confidence (number between 0 and 1 for how sure you are about the figures).
Documents may be in English or Bahasa Malaysia. Use numbers without currency symbols or thousands separators. Do not add commentary.`;

export function hasLiveExtraction(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const DEMO_SUPPLIERS: [string, string, number, number][] = [
  ["Kedai Buku Harapan Sdn Bhd", "Stationery and printing supplies", 186.4, 0],
  ["Larian Ride Services", "Business ride and delivery charges", 94.2, 0],
  ["Cloudwork Software Ltd", "Business software subscription", 312.0, 24.96],
  ["Syarikat Air Bersih", "Water bill", 128.35, 0],
  ["Pantas Courier Express", "Courier charges", 77.0, 6.16],
];

export function demoExtract(fileName: string): ExtractedBill {
  const h = hash(fileName || "sample");
  const [supplier, description, subtotal, tax] = DEMO_SUPPLIERS[h % DEMO_SUPPLIERS.length];
  return {
    supplier,
    invoiceNo: `INV-${10000 + (h % 89999)}`,
    date: new Date().toISOString().slice(0, 10),
    currency: "MYR",
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    description,
    confidence: 0.9,
  };
}

export async function liveExtract(file: File): Promise<ExtractedBill> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const data = bytes.toString("base64");
  const isPdf = file.type === "application/pdf";
  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data } };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Extraction failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string = (json.content || []).map((c: { text?: string }) => c.text || "").join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Extraction returned no JSON");
  const parsed = JSON.parse(match[0]);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const subtotal = num(parsed.subtotal);
  const tax = num(parsed.tax);
  return {
    supplier: String(parsed.supplier || ""),
    invoiceNo: String(parsed.invoiceNo || ""),
    date: String(parsed.date || new Date().toISOString().slice(0, 10)),
    currency: String(parsed.currency || "MYR"),
    subtotal,
    tax,
    total: num(parsed.total) || Math.round((subtotal + tax) * 100) / 100,
    description: String(parsed.description || ""),
    confidence: Math.min(1, Math.max(0, num(parsed.confidence) || 0.7)),
  };
}
