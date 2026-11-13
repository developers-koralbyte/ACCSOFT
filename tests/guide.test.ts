import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GUIDE_STEPS } from "@/lib/guide";
import { ingestPdf } from "@/lib/statements/ingest";
import { seedState } from "@/lib/demo";
import { reconcileForClient } from "@/lib/month/snapshot";
import { acceptSuggestion, answerWithText, markBankOnly } from "@/lib/match/actions";
import { approveMonth, prepareMonth } from "@/lib/month/signoff";
import { auditPackZip } from "@/lib/export/audit";
import { STAFF } from "@/lib/staff";
import type { AppState } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
const [aisyah, daniel] = STAFF;

async function sample(id: string, file: string) {
  const data = new Uint8Array(fs.readFileSync(path.join(__dirname, "../public/samples", file)));
  const r = await ingestPdf(data, { pdfjs, liveAvailable: false });
  if (r.kind !== "statement") throw new Error("not read");
  return { ...r.draft, id, clientId: "c1", fileName: file, kind: "sample" as const, addedAt: "2026-11-13T00:00:00Z" };
}

describe("guided demo", () => {
  it("has seven steps with unique ids and real routes", () => {
    expect(GUIDE_STEPS).toHaveLength(7);
    expect(new Set(GUIDE_STEPS.map((s) => s.id)).size).toBe(7);
    for (const s of GUIDE_STEPS) expect(s.href).toMatch(/^\/(statements|questions|board|month|export)/);
  });
  it("uses no em or en dashes", () => {
    expect(JSON.stringify(GUIDE_STEPS.map((s) => [s.title, s.text]))).not.toMatch(/[–—]/);
  });

  it("every step ticks itself as the data changes, with no API key", async () => {
    let s: AppState = seedState();
    const step = (id: string) => GUIDE_STEPS.find((x) => x.id === id)!;
    expect(step("upload").done!(s)).toBe(false);
    expect(step("match").done!(s)).toBe(false);

    // 1. upload both samples
    s = { ...s, statements: [...s.statements, await sample("sep", "bank-a-sep-2026.pdf"), await sample("oct", "bank-a-oct-2026.pdf")] };
    expect(step("upload").done!(s)).toBe(true);
    expect(step("match").done!(s)).toBe(false);

    // 3. accept the suggestion, then confirm all bank only lines
    let recon = reconcileForClient(s, "c1");
    const sugg = [...recon.results.values()].find((r) => r.statementId === "oct" && r.state === "suggested")!;
    s = { ...s, decisions: acceptSuggestion(s.decisions, sugg, sugg.category, sugg.taxCode, aisyah.name) };
    recon = reconcileForClient(s, "c1");
    for (const r of recon.results.values()) {
      if (r.statementId === "oct" && r.state === "bank-only") s = { ...s, decisions: markBankOnly(s.decisions, r.key, r.category, r.taxCode, aisyah.name) };
    }
    expect(step("match").done!(s)).toBe(true);
    expect(step("ask").done!(s)).toBe(false);

    // 4. answer both questions
    recon = reconcileForClient(s, "c1");
    for (const r of recon.results.values()) {
      if (r.statementId === "oct" && r.state === "unexplained") s = { ...s, decisions: answerWithText(s.decisions, r.key, "Example answer", r.category, r.taxCode, aisyah.name) };
    }
    expect(step("ask").done!(s)).toBe(true);
    expect(step("approve").done!(s)).toBe(false);

    // 6. two people approve, acknowledging the missing rent receipt
    const p = prepareMonth(s, "c1", "2026-10", aisyah);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const a = approveMonth(p.state, "c1", "2026-10", daniel, { ackOutstanding: true });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(step("approve").done!(a.state)).toBe(true);

    // 7. the audit pack builds from the approved month
    const zip = auditPackZip({ state: a.state, clientId: "c1", month: "2026-10", generatedAt: "2026-11-13T05:00:00Z", pdfs: {} });
    expect(zip.byteLength).toBeGreaterThan(1000);
  });
});
