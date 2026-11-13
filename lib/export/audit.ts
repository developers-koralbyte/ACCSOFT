import { strToU8, zipSync } from "fflate";
import { fmtDate, fmtDateTime, fmtRM, monthName } from "../money";
import { getMonth } from "../month/records";
import type { MonthRecord, MonthSnapshot, SnapStatement } from "../month/types";
import type { AppState, Client } from "../types";
import { SITE } from "../site-config";
import { toCsv, safeName } from "./csv";
import { exportBankLines, genericCsv } from "./formats";
import { ledgerInfo } from "./ledgers";
import { exportLines, exportLinesOf, type ExportLine } from "./lines";

// The audit pack for an APPROVED month: one ZIP built from the approval snapshot.
// Nothing here reads live matching, so the pack always agrees with what was signed off.

export interface PdfFile {
  name: string;
  data: Uint8Array;
}

export interface AuditInput {
  state: AppState;
  clientId: string;
  month: string;
  generatedAt: string; // ISO
  pdfs: Record<string, PdfFile>; // by statement id, where the app still holds the file
}

const esc = (s: string | number | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function approvedMonth(state: AppState, clientId: string, month: string): { rec: MonthRecord; snapshot: MonthSnapshot; client: Client } {
  const rec = getMonth(state, clientId, month);
  const client = state.clients.find((c) => c.id === clientId);
  if (!rec.snapshot || !rec.reviewed || !client) throw new Error(`${monthName(month)} is not approved, so there is nothing to export yet.`);
  return { rec, snapshot: rec.snapshot, client };
}

export function isApproved(state: AppState, clientId: string, month: string): boolean {
  const rec = getMonth(state, clientId, month);
  return Boolean(rec.snapshot && rec.reviewed);
}

// ---------- the printable reconciliation statement ----------

function statementSection(s: SnapStatement, bills: MonthSnapshot["bills"], lines: ExportLine[]): string {
  const hasBooks = s.booksBalance !== null;
  const matched = lines.filter((l) => l.state === "matched");
  const bankOnly = lines.filter((l) => l.state === "bank-only");
  const answered = lines.filter((l) => l.state === "answered");
  const snapLine = (n: number) => s.lines.find((x) => x.lineNo === n);
  const diff = hasBooks && s.closing !== null ? s.closing - (s.booksBalance as number) : null;

  const rows = (items: ExportLine[], cols: (l: ExportLine) => (string | number)[]) =>
    items.length === 0 ? `<tr><td colspan="9" class="none">None</td></tr>` : items.map((l) => `<tr>${cols(l).map((c) => `<td${/^[+-]?RM[\d,]+\.\d{2}$/.test(String(c)) ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("");
  const amt = (l: ExportLine) => (l.credit ? `+${fmtRM(l.credit)}` : `-${fmtRM(l.debit)}`);

  const outstandingText = answered.filter((l) => !l.documents).map((l) => `Line ${l.lineNo}, ${fmtDate(l.date)}, ${amt(l)}: explained by the client in words only, no document held`);
  const totalsOnly = s.proofStatus === "totals-only" ? [`Proven on totals only${s.totalsOnlyAcknowledged ? " (the warning was acknowledged)" : ""}: single lines were not proven`] : [];

  return `
<section>
  <h2>${esc(s.bank)}, account ending ${esc(s.accountLast4)}: ${hasBooks ? "bank reconciliation" : "bank statement review"}</h2>
  <p class="meta">${esc(fmtDate(s.periodStart))} to ${esc(fmtDate(s.periodEnd))} | ${esc(s.fileName)} | ${esc(s.proofLabel)}</p>
  <table class="sum">
    <tr><th>Opening balance per bank</th><td class="num">${s.opening === null ? "n/a" : esc(fmtRM(s.opening))}</td></tr>
    <tr><th>Money in</th><td class="num">+${esc(fmtRM(s.totalCredit))}</td></tr>
    <tr><th>Money out</th><td class="num">-${esc(fmtRM(s.totalDebit))}</td></tr>
    <tr class="tot"><th>Balance per bank at ${esc(fmtDate(s.periodEnd))}</th><td class="num">${s.closing === null ? "n/a" : esc(fmtRM(s.closing))}</td></tr>
    ${hasBooks ? `<tr><th>Balance per books (typed in by the accountant)</th><td class="num">${esc(fmtRM(s.booksBalance as number))}</td></tr>
    <tr class="tot"><th>Difference (bank less books)</th><td class="num">${diff === null ? "n/a" : esc(fmtRM(diff))}</td></tr>` : ""}
  </table>

  <h3>Items matched to documents (${matched.length})</h3>
  <table><thead><tr><th>Line</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Document</th><th>Rule or person</th><th>Category</th><th>Tax code</th></tr></thead>
  <tbody>${rows(matched, (l) => [l.lineNo, fmtDate(l.date), l.description, amt(l), l.documents, l.basis, l.category, l.taxCode])}</tbody></table>

  <h3>Bank only (${bankOnly.length})</h3>
  <table><thead><tr><th>Line</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>Tax code</th><th>Confirmed by a person</th></tr></thead>
  <tbody>${rows(bankOnly, (l) => [l.lineNo, fmtDate(l.date), l.description, amt(l), l.category, l.taxCode, l.confirmed ? "Yes" : "No"])}</tbody></table>

  <h3>Answered by the client (${answered.length})</h3>
  <table><thead><tr><th>Line</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Answer</th><th>Recorded by</th><th>Document</th><th>Category</th></tr></thead>
  <tbody>${rows(answered, (l) => {
    const sl = snapLine(l.lineNo);
    return [l.lineNo, fmtDate(l.date), l.description, amt(l), l.answer || "(document)", sl?.answer ? `${sl.answer.by}, ${fmtDateTime(sl.answer.at)}` : "", l.documents, l.category];
  })}</tbody></table>
  ${hasBooks && (outstandingText.length || totalsOnly.length) ? `<h3>Items to consider against the difference</h3><ul>${[...outstandingText, ...totalsOnly].map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
</section>`;
}

export function reconciliationHtml(args: { state: AppState; clientId: string; month: string; generatedAt: string }): string {
  const { rec, snapshot, client } = approvedMonth(args.state, args.clientId, args.month);
  const allBooks = snapshot.statements.length > 0 && snapshot.statements.every((s) => s.booksBalance !== null);
  const title = allBooks ? "Bank reconciliation statement" : "Bank statement review summary";
  const sample = snapshot.statements.length > 0 && snapshot.statements.every((s) => s.id.startsWith("seed-") || args.state.statements.find((x) => x.id === s.id)?.kind === "sample");
  const sections = snapshot.statements.map((s) => statementSection(s, snapshot.bills, exportLinesOf(s, snapshot.bills))).join("\n");
  const outstanding = snapshot.outstandingDocs > 0
    ? `<p>Approved with <strong>${snapshot.outstandingDocs}</strong> ${snapshot.outstandingDocs === 1 ? "document" : "documents"} outstanding: ${esc(snapshot.missingDocs.join(", "))}.</p>`
    : "<p>No documents were outstanding at approval.</p>";
  const waived = snapshot.waived.length ? `<p>Marked "not needed this month": ${esc(snapshot.waived.join(", "))}.</p>` : "";
  const books = allBooks ? "" : "<p class=\"meta\">No balance per books was entered for this month, so this page is a review of the bank statement and does not reconcile to the ledger.</p>";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: ${esc(client.name)}, ${esc(monthName(args.month))}</title>
<style>
  body { font: 14px/1.5 system-ui, "Segoe UI", Arial, sans-serif; color: #0f172a; max-width: 980px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 26px 0 4px; } h3 { font-size: 14px; margin: 16px 0 6px; }
  .meta { color: #5b6678; font-size: 12px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e3e8ef; vertical-align: top; }
  th { color: #5b6678; font-weight: 600; } .num { text-align: right; white-space: nowrap; } .none { color: #5b6678; }
  table.sum { width: auto; min-width: 420px; font-size: 13px; } table.sum th { color: #0f172a; font-weight: 500; }
  tr.tot th, tr.tot td { font-weight: 700; border-top: 1px solid #0f172a; }
  .sign { display: flex; gap: 40px; margin-top: 8px; } .sign div { min-width: 220px; }
  .flag { background: #fef3c7; border: 1px solid #fcd34d; padding: 6px 10px; border-radius: 6px; font-size: 12px; }
  footer { margin-top: 28px; color: #5b6678; font-size: 11px; }
  @page { size: A4; margin: 14mm; } @media print { body { margin: 0; max-width: none; } section { break-inside: avoid-page; } }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="meta">${esc(client.name)} | ${esc(monthName(args.month))} | Ledger: ${esc(ledgerInfo(client.ledger).label)} | Generated ${esc(fmtDateTime(args.generatedAt))}</p>
${sample ? '<p class="flag">Sample data: every name, account number and amount in this document is invented.</p>' : ""}
${books}
${sections}
<section>
  <h2>Outstanding at approval</h2>
  ${outstanding}${waived}
</section>
<section>
  <h2>Sign-off</h2>
  <div class="sign">
    <div><strong>Prepared by</strong><br>${esc(rec.prepared?.name)}<br><span class="meta">${esc(rec.prepared ? fmtDateTime(rec.prepared.at) : "")}</span></div>
    <div><strong>Reviewed by</strong><br>${esc(rec.reviewed?.name)}<br><span class="meta">${esc(rec.reviewed ? fmtDateTime(rec.reviewed.at) : "")}</span></div>
  </div>
</section>
<footer>Built from the approval snapshot taken ${esc(fmtDateTime(snapshot.takenAt))}. It does not change if documents are edited later. Prepared with ${esc(SITE.name)}.</footer>
</body></html>`;
}

// ---------- the CSV files ----------

export function questionsCsv(snapshot: MonthSnapshot): string {
  const rows: (string | number)[][] = [["Line", "Date", "Amount", "Description", "Question sent", "Client answer", "Recorded by", "Recorded at", "Document linked", "Category", "Tax code"]];
  const bills = new Map(snapshot.bills.map((b) => [b.id, b]));
  for (const s of snapshot.statements) {
    for (const l of s.lines) {
      if (!l.answer && !l.questionSentAt) continue;
      const doc = l.billIds.map((id) => bills.get(id)).filter(Boolean).map((b) => `${b!.supplier} ${b!.invoiceNo}`.trim()).join(" + ");
      rows.push([l.lineNo, fmtDate(l.date), fmtRM(l.credit || l.debit), l.description, l.questionSentAt ? fmtDate(l.questionSentAt.slice(0, 10)) : "", l.answer?.text ?? (l.answer ? "(document)" : ""), l.answer?.by ?? "", l.answer ? fmtDateTime(l.answer.at) : "", doc, l.category, l.taxCode]);
    }
  }
  return toCsv(rows);
}

export function signoffCsv(rec: MonthRecord, snapshot: MonthSnapshot): string {
  const rows: (string | number)[][] = [["Item", "Detail", "When"]];
  rows.push(["Prepared by", rec.prepared?.name ?? "", rec.prepared ? fmtDateTime(rec.prepared.at) : ""]);
  rows.push(["Reviewed by", rec.reviewed?.name ?? "", rec.reviewed ? fmtDateTime(rec.reviewed.at) : ""]);
  rows.push(["Snapshot taken", "", fmtDateTime(snapshot.takenAt)]);
  rows.push(["Documents outstanding at approval", snapshot.outstandingDocs > 0 ? `${snapshot.outstandingDocs}: ${snapshot.missingDocs.join(", ")}` : "None", ""]);
  if (snapshot.waived.length) rows.push(["Marked not needed this month", snapshot.waived.join(", "), ""]);
  for (const s of snapshot.statements) {
    rows.push([`Statement ${s.fileName}`, `${s.proofLabel}${s.proofStatus === "totals-only" ? (s.totalsOnlyAcknowledged ? " (warning acknowledged)" : " (warning NOT acknowledged)") : ""}`, ""]);
    rows.push([`Balance per books, ${s.fileName}`, s.booksBalance === null ? "Not entered" : fmtRM(s.booksBalance), ""]);
  }
  for (const h of rec.history) rows.push([`History: ${h.kind}`, `${h.by}: ${h.text}`, fmtDateTime(h.at)]);
  return toCsv(rows);
}

export function activityCsv(state: AppState, clientId: string, month: string): string {
  const rows: (string | number)[][] = [["When", "Who", "Month", "Kind", "What"]];
  const items = state.activity.filter((a) => a.clientId === clientId && (!a.month || a.month === month)).sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const a of items) rows.push([fmtDateTime(a.at), a.by, a.month ? monthName(a.month) : "", a.kind, a.text]);
  return toCsv(rows);
}

// ---------- the pack ----------

export function auditPackFiles(input: AuditInput): Record<string, Uint8Array> {
  const { state, clientId, month } = input;
  const { rec, snapshot, client } = approvedMonth(state, clientId, month);
  const lines = exportLines(snapshot);
  const ledger = exportBankLines(client.ledger ?? "other", lines, { clientName: client.name, month });
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, text: string) => (files[name] = strToU8(text));

  put("reconciliation-statement.html", reconciliationHtml({ state, clientId, month, generatedAt: input.generatedAt }));
  put("line-by-line.csv", genericCsv(lines));
  put("client-questions-and-answers.csv", questionsCsv(snapshot));
  put("sign-off.csv", signoffCsv(rec, snapshot));
  put("activity-log.csv", activityCsv(state, clientId, month));
  put(ledger.fileName, ledger.csv);

  const held: string[] = [];
  const notHeld: string[] = [];
  for (const s of snapshot.statements) {
    const f = input.pdfs[s.id];
    if (f) {
      files[`source-statements/${safeName(s.id).slice(0, 8)}-${f.name}`] = f.data;
      held.push(s.fileName);
    } else notHeld.push(s.fileName);
  }
  put(
    "README.txt",
    [
      `Audit pack: ${client.name}, ${monthName(month)}`,
      `Generated ${fmtDateTime(input.generatedAt)} from the approval snapshot taken ${fmtDateTime(snapshot.takenAt)}.`,
      "",
      "reconciliation-statement.html   Open and print. Balance per bank, matched items, bank only, answered, outstanding at approval, sign-off.",
      "line-by-line.csv                Every bank line with its state, category, tax code, document and the rule or person behind it.",
      "client-questions-and-answers.csv Questions sent to the client and the answers recorded.",
      "sign-off.csv                    Prepared by, reviewed by, acknowledgements and history.",
      "activity-log.csv                Every correction, acceptance, confirmation, question, answer, approval and reopening.",
      `${ledger.fileName}`,
      ledger.draft ? "                                THIS LEDGER FILE IS A DRAFT TEMPLATE: verify against the vendor's own import template before use." : "                                Bank lines in the client's ledger format.",
      "",
      held.length ? `Source statement PDFs included: ${held.join(", ")}` : "No source statement PDFs are held for this month.",
      notHeld.length ? `No file held for: ${notHeld.join(", ")} (the figures are in the files above).` : "",
    ].filter((l) => l !== "").join("\r\n") + "\r\n",
  );
  return files;
}

export function auditPackZip(input: AuditInput): Uint8Array {
  return zipSync(auditPackFiles(input), { level: 6 });
}

export function auditPackName(clientName: string, month: string): string {
  return `${safeName(clientName)}-${month}-audit-pack.zip`;
}
