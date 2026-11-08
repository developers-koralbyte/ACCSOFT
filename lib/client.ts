import { prepareFile } from "./image";
import type { ExtractedBill } from "./types";

interface ExtractResponse {
  error?: string;
  mode?: "live" | "demo";
  bill?: ExtractedBill;
}

// Browser helper: shrink the file if needed, send it to the extraction route, return the result.
export async function extractFile(file: File): Promise<{ mode: "live" | "demo"; bill: ExtractedBill }> {
  const prepared = await prepareFile(file);
  const form = new FormData();
  form.append("file", prepared);
  const res = await fetch("/api/extract", { method: "POST", body: form });
  let json: ExtractResponse = {};
  try {
    json = (await res.json()) as ExtractResponse;
  } catch {
    /* the platform can answer with plain text, handled below */
  }
  if (!res.ok || !json.bill || !json.mode) {
    if (res.status === 413) throw new Error("File is too large. Try a smaller photo or a screenshot.");
    throw new Error(json.error || "Extraction failed");
  }
  return { mode: json.mode, bill: json.bill };
}
