import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingestPdf } from "@/lib/statements/ingest";
import { proveStatement, correctLine } from "@/lib/statements/proof";
import { checkContinuity } from "@/lib/statements/continuity";
import { PdfPasswordError } from "@/lib/statements/pdf";
import { safeFileName } from "@/lib/statements/build";
import expected from "@/data/sample-expected.json";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
const read = (file: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "../public/samples", file)));
type Exp = (typeof expected)["sample-sep"];

async function load(id: keyof typeof expected) {
  const e = expected[id] as Exp & { breakLineNo: number | null; impliedAmount: number | null };
  const r = await ingestPdf(read(e.file), { pdfjs, liveAvailable: false });
  if (r.kind !== "statement") throw new Error(`sample ${id} was not read: ${r.kind}`);
  return { e, draft: r.draft };
}

describe("sample statement PDFs go through the real pdfjs path", () => {
  it.each(["sample-sep", "sample-oct", "sample-break"] as const)("%s extracts every line, balance and header field", async (id) => {
    const { e, draft } = await load(id);
    expect(draft.lines).toHaveLength(e.lineCount);
    expect(draft.opening).toBe(e.opening);
    expect(draft.closing).toBe(e.closing);
    expect(draft.periodStart).toBe(e.periodStart);
    expect(draft.periodEnd).toBe(e.periodEnd);
    expect(draft.accountLast4).toBe(e.accountLast4);
    expect(draft.bank).toBe(e.layout === "A" ? "Bank A Berhad" : "Bank B Berhad");
    expect(draft.lines.every((l) => l.balance !== null)).toBe(true);
    expect(draft.lines.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date))).toBe(true);
  });

  it("the clean sample is proven to the cent", async () => {
    const { draft } = await load("sample-sep");
    const p = proveStatement(draft);
    expect(p.status).toBe("proven");
    expect(p.label).toBe("Proven to the cent");
  });

  it("reads wrapped descriptions, including one that carries over a page break", async () => {
    const { draft } = await load("sample-oct");
    const fpx = draft.lines.find((l) => l.description.includes("FPX PAYMENT"));
    expect(fpx?.description).toContain("MERCHANT 5519");
    expect(fpx?.description).toContain("REF 77120045");
    expect(draft.lines.some((l) => l.page === 2)).toBe(true);
    // the page banner and footer never leak into a description
    expect(draft.lines.every((l) => !/BANK A BERHAD|LEDGER|Note:/.test(l.description))).toBe(true);
  });

  it("reads printed totals and proves the follow-on sample", async () => {
    const { e, draft } = await load("sample-oct");
    expect(draft.printedTotals).toEqual({ debit: e.totalDebit, credit: e.totalCredit });
    const p = proveStatement(draft);
    expect(p.status).toBe("proven");
    expect(p.printed.debit?.ok).toBe(true);
  });

  it("the broken sample points to the exact line and can be corrected inline", async () => {
    const { e, draft } = await load("sample-break");
    const p = proveStatement(draft);
    expect(p.status).toBe("break");
    expect(p.label).toBe(`Break at line ${e.breakLineNo}`);
    expect(p.breaks).toHaveLength(1);
    expect(p.breaks[0].implied).toEqual({ side: "debit", amount: e.impliedAmount });
    const fixed = correctLine(draft.lines, p.breaks[0].lineId, "debit", (e.impliedAmount ?? 0));
    expect(proveStatement({ ...draft, lines: fixed }).status).toBe("proven");
  });

  it("the follow-on sample passes continuity and the gap is named when September is missing", async () => {
    const sep = (await load("sample-sep")).draft;
    const oct = (await load("sample-oct")).draft;
    const meta = (id: string, d: typeof sep) => ({ id, bank: d.bank, accountKey: d.accountKey, accountLast4: d.accountLast4, periodStart: d.periodStart, periodEnd: d.periodEnd, opening: d.opening, closing: d.closing });
    expect(checkContinuity([meta("sep", sep), meta("oct", oct)])).toEqual([]);
    const aug = { ...meta("aug", sep), periodStart: "2026-07-01", periodEnd: "2026-07-31" };
    const issues = checkContinuity([aug, meta("oct", oct)]);
    expect(issues[0].kind).toBe("gap");
    expect(issues[0].message).toContain("August 2026");
    expect(issues[0].message).toContain("September 2026");
  });

  it("never keeps the full account number", async () => {
    const { draft } = await load("sample-sep");
    expect(JSON.stringify(draft)).not.toContain("701122334455");
    expect(draft.accountLast4).toBe("4455");
  });

  it("scanned pages are refused with a clear reason when live extraction is off", async () => {
    // a PDF with one page and no text at all
    const blank = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\ntrailer\n<< /Root 1 0 R /Size 4 >>\n%%EOF\n",
    );
    const r = await ingestPdf(new Uint8Array(blank), { pdfjs, liveAvailable: false });
    expect(r.kind).toBe("needs-live");
  });
});

describe("privacy", () => {
  it("masks account numbers inside file names", () => {
    expect(safeFileName("564940007287_D_31Oct2026.pdf")).toBe("****7287_D_31Oct2026.pdf");
    expect(safeFileName("statement-sep-2026.pdf")).toBe("statement-sep-2026.pdf");
  });
});

describe("password protected PDFs (fictional fixture, password is demo1234)", () => {
  const locked = new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/locked.pdf")));
  it("asks for the password instead of failing silently", async () => {
    await expect(ingestPdf(locked, { pdfjs, liveAvailable: false })).rejects.toMatchObject({ reason: "need" });
  });
  it("rejects a wrong password", async () => {
    await expect(ingestPdf(locked, { pdfjs, liveAvailable: false, password: "nope" })).rejects.toMatchObject({ reason: "wrong" });
    await expect(ingestPdf(locked, { pdfjs, liveAvailable: false, password: "nope" })).rejects.toBeInstanceOf(PdfPasswordError);
  });
  it("unlocks in memory with the right password and proves the statement", async () => {
    const r = await ingestPdf(locked, { pdfjs, liveAvailable: false, password: "demo1234" });
    expect(r.kind).toBe("statement");
    if (r.kind === "statement") expect(proveStatement(r.draft).status).toBe("proven");
  });
});
