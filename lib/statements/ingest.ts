import { parseSen } from "../money";
import { accountIdentity, parseStatementPages, type ParsedStatement } from "./parse";
import { openPdf, readPages, renderPageJpeg, type PdfJs } from "./pdf";
import type { StmtLine } from "./types";

export type IngestResult =
  | { kind: "statement"; draft: ParsedStatement; usedLive: boolean }
  | { kind: "needs-live"; pages: number[] }
  | { kind: "unreadable"; reason: string };

export interface LivePage {
  bank?: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  opening?: string | null;
  closing?: string | null;
  lines: { date: string; description: string; debit?: string; credit?: string; balance?: string | null }[];
}

export interface IngestOptions {
  pdfjs: PdfJs;
  password?: string; // used for this call only, never stored
  liveAvailable: boolean;
  // Sends one scanned page image to the server. Only called when liveAvailable is true.
  extractPage?: (jpegBase64: string, page: number) => Promise<LivePage>;
}

// Reads a statement PDF. Digital PDFs are parsed in the browser from their text layer: free, and nothing is uploaded.
// Only pages with no text layer ever go to the model, and only when a key is configured.
export async function ingestPdf(data: Uint8Array, opts: IngestOptions): Promise<IngestResult> {
  const doc = await openPdf(opts.pdfjs, data, opts.password); // throws PdfPasswordError
  const { pages, scanned } = await readPages(doc);

  let draft: ParsedStatement | null = null;
  if (pages.length > 0) {
    const out = parseStatementPages(pages);
    if (out.ok && out.draft) draft = out.draft;
  }

  if (scanned.length === 0) {
    if (draft) return { kind: "statement", draft, usedLive: false };
    return { kind: "unreadable", reason: "No transaction table was found in the text of this PDF." };
  }

  // some pages have no text layer and need live extraction
  if (!opts.liveAvailable || !opts.extractPage) {
    if (draft) {
      draft.warnings.push(
        `Page${scanned.length > 1 ? "s" : ""} ${scanned.join(", ")} ha${scanned.length > 1 ? "ve" : "s"} no text layer and ${scanned.length > 1 ? "were" : "was"} skipped. The balance proof will show if lines are missing.`,
      );
      return { kind: "statement", draft, usedLive: false };
    }
    return { kind: "needs-live", pages: scanned };
  }
  const live: { page: number; data: LivePage }[] = [];
  for (const n of scanned) {
    const jpeg = await renderPageJpeg(doc, n);
    live.push({ page: n, data: await opts.extractPage(jpeg, n) });
  }
  return { kind: "statement", draft: mergeLive(draft, live), usedLive: true };
}

function liveLines(p: { page: number; data: LivePage }): { l: StmtLine; page: number }[] {
  return p.data.lines.map((l) => ({
    page: p.page,
    l: {
      id: "",
      date: l.date,
      description: l.description,
      debit: l.debit ? parseSen(l.debit) ?? 0 : 0,
      credit: l.credit ? parseSen(l.credit) ?? 0 : 0,
      balance: l.balance ? parseSen(l.balance) : null,
      page: p.page,
    },
  }));
}

function mergeLive(base: ParsedStatement | null, live: { page: number; data: LivePage }[]): ParsedStatement {
  const first = live.find((p) => p.data.accountNumber || p.data.bank) ?? live[0];
  const acct = first.data.accountNumber ? accountIdentity(first.data.accountNumber) : null;
  const merged = [...(base?.lines ?? []).map((l) => ({ l, page: l.page })), ...live.flatMap(liveLines)];
  merged.sort((a, b) => a.page - b.page);
  const lines = merged.map((m, i) => ({ ...m.l, id: `l${i + 1}` }));
  const openRaw = live.map((p) => p.data.opening).find((v) => v);
  const closeRaw = [...live].reverse().map((p) => p.data.closing).find((v) => v);
  const dates = lines.map((l) => l.date).filter(Boolean).sort();
  return {
    bank: base?.bank ?? first.data.bank ?? "Unknown bank",
    accountLast4: base?.accountLast4 ?? acct?.last4 ?? "----",
    accountKey: base?.accountKey ?? acct?.key ?? "unknown",
    periodStart: base?.periodStart ?? first.data.periodStart ?? dates[0] ?? "",
    periodEnd: base?.periodEnd ?? first.data.periodEnd ?? dates[dates.length - 1] ?? "",
    opening: base?.opening ?? (openRaw ? parseSen(openRaw) : null),
    closing: base?.closing ?? (closeRaw ? parseSen(closeRaw) : null),
    printedTotals: base?.printedTotals,
    lines,
    warnings: [...(base?.warnings ?? []), "Scanned pages were read by the model, so check every figure against the PDF. The balance proof still applies."],
  };
}
