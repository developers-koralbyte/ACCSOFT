import { strToU8, zipSync } from "fflate";
import { pastCutoff } from "../board";
import { fmtDateTime, monthIndex, monthName, monthOf, nextMonth } from "../money";
import { getMonth } from "../month/records";
import { readiness } from "../month/signoff";
import { reconcileForClient } from "../month/snapshot";
import { proveStatement } from "../statements/proof";
import type { AppState } from "../types";
import { auditPackFiles, isApproved, type PdfFile } from "./audit";
import { toCsv, safeName } from "./csv";

// Year-end mode: a financial year per client and account, and one bundle of all the approved months' audit packs.

export interface FyRange {
  endMonth: string; // YYYY-MM
  startMonth: string;
  months: string[];
  label: string;
}

export function fyRange(fyEndMonth: number, endYear: number): FyRange {
  const endMonth = `${endYear}-${String(fyEndMonth).padStart(2, "0")}`;
  const months: string[] = [];
  let m = endMonth;
  for (let i = 0; i < 12; i++) {
    months.unshift(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
  }
  return { endMonth, startMonth: months[0], months, label: `Financial year ending ${monthName(endMonth)} (${monthName(months[0])} to ${monthName(endMonth)})` };
}

// The financial year (by its end year) a month falls in.
export function fyEndYearOf(month: string, fyEndMonth: number): number {
  const [y, m] = month.split("-").map(Number);
  return m <= fyEndMonth ? y : y + 1;
}

export function fyOptions(state: AppState, clientId: string, extraMonth?: string): number[] {
  const fyEnd = state.clients.find((c) => c.id === clientId)?.fyEndMonth ?? 12;
  const months = [...state.statements.filter((s) => s.clientId === clientId).map((s) => monthOf(s.periodEnd)), ...(extraMonth ? [extraMonth] : [])];
  return Array.from(new Set(months.map((m) => fyEndYearOf(m, fyEnd)))).sort((a, b) => b - a);
}

export interface YearEndMonth {
  month: string;
  hasStatement: boolean;
  due: boolean; // the statement for this month is due (the cutoff has passed)
  proven: boolean;
  proofLabel: string;
  breaks: number;
  reconciled: boolean;
  approved: boolean;
}

export interface YearEndAccount {
  accountKey: string;
  last4: string;
  bank: string;
  months: YearEndMonth[];
  provenCount: number;
  missing: string[]; // due months with no statement
  breakCount: number;
  reconciledCount: number;
}

export interface YearEndView {
  fy: FyRange;
  accounts: YearEndAccount[];
  approvedMonths: string[];
  notApproved: { month: string; reason: string }[];
}

export function yearEndView(state: AppState, clientId: string, fy: FyRange, now: Date): YearEndView {
  const statements = state.statements.filter((s) => s.clientId === clientId && fy.months.includes(monthOf(s.periodEnd)));
  const recon = reconcileForClient(state, clientId);
  const accounts: YearEndAccount[] = [];

  const keys = Array.from(new Set(statements.map((s) => s.accountKey)));
  for (const key of keys) {
    const mine = statements.filter((s) => s.accountKey === key);
    const months: YearEndMonth[] = fy.months.map((m) => {
      const s = mine.find((x) => monthOf(x.periodEnd) === m);
      const due = pastCutoff(m, now);
      if (!s) return { month: m, hasStatement: false, due, proven: false, proofLabel: due ? "Missing" : "Not due yet", breaks: 0, reconciled: false, approved: isApproved(state, clientId, m) };
      const p = proveStatement(s);
      return {
        month: m,
        hasStatement: true,
        due,
        proven: p.status === "proven",
        proofLabel: p.label,
        breaks: p.breaks.length + (p.closingMismatch && p.breaks.length === 0 ? 1 : 0),
        reconciled: Boolean(recon.summaries.get(s.id)?.reconciled),
        approved: isApproved(state, clientId, m),
      };
    });
    accounts.push({
      accountKey: key,
      last4: mine[0].accountLast4,
      bank: mine[0].bank,
      months,
      provenCount: months.filter((x) => x.proven).length,
      missing: months.filter((x) => !x.hasStatement && x.due).map((x) => x.month),
      breakCount: months.reduce((a, x) => a + x.breaks, 0),
      reconciledCount: months.filter((x) => x.reconciled).length,
    });
  }

  const approvedMonths = fy.months.filter((m) => isApproved(state, clientId, m));
  const notApproved = fy.months
    .filter((m) => !approvedMonths.includes(m) && (pastCutoff(m, now) || statements.some((s) => monthOf(s.periodEnd) === m)))
    .map((m) => {
      const r = readiness(state, clientId, m);
      const rec = getMonth(state, clientId, m);
      return { month: m, reason: r.statements.length === 0 ? "No statement has arrived" : rec.prepared ? `Prepared by ${rec.prepared.name}, awaiting review` : r.missing.join("; ") || "Ready to prepare and approve" };
    });
  return { fy, accounts, approvedMonths, notApproved };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function yearEndSummaryHtml(clientName: string, view: YearEndView, generatedAt: string): string {
  const acct = view.accounts
    .map(
      (a) => `<h2>${esc(a.bank)}, account ending ${esc(a.last4)}</h2>
<p>Months proven: <strong>${a.provenCount} of 12</strong>. Months missing: <strong>${a.missing.length}</strong>${a.missing.length ? ` (${esc(a.missing.map(monthName).join(", "))})` : ""}. Breaks found: <strong>${a.breakCount}</strong>. Months reconciled: <strong>${a.reconciledCount}</strong>.</p>
<table><thead><tr><th>Month</th><th>Statement</th><th>Reconciled</th><th>Approved</th></tr></thead><tbody>${a.months
        .map((m) => `<tr><td>${esc(monthName(m.month))}</td><td>${esc(m.proofLabel)}${m.breaks ? ` (${m.breaks} break${m.breaks === 1 ? "" : "s"})` : ""}</td><td>${m.hasStatement ? (m.reconciled ? "Yes" : "No") : ""}</td><td>${m.approved ? "Yes" : "No"}</td></tr>`)
        .join("")}</tbody></table>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Year-end summary: ${esc(clientName)}</title>
<style>body{font:14px/1.5 system-ui,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#0f172a}h1{font-size:22px}h2{font-size:16px;margin-top:22px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e3e8ef}th{color:#5b6678}.meta{color:#5b6678;font-size:12px}@page{size:A4;margin:14mm}</style></head><body>
<h1>Year-end summary: ${esc(clientName)}</h1>
<p class="meta">${esc(view.fy.label)} | Generated ${esc(fmtDateTime(generatedAt))}</p>
<p>Approved months included in this pack: <strong>${view.approvedMonths.length}</strong>${view.approvedMonths.length ? ` (${esc(view.approvedMonths.map(monthName).join(", "))})` : ""}.</p>
${view.notApproved.length ? `<h2>Months not yet approved (${view.notApproved.length})</h2><ul>${view.notApproved.map((n) => `<li>${esc(monthName(n.month))}: ${esc(n.reason)}</li>`).join("")}</ul>` : "<p>Every month in the year is approved.</p>"}
${acct}
</body></html>`;
}

export interface YearEndInput {
  state: AppState;
  clientId: string;
  fy: FyRange;
  now: Date;
  generatedAt: string;
  pdfsByStatement: Record<string, PdfFile>;
}

// One ZIP: a folder with the audit pack for each approved month, plus a summary that lists what is not approved yet.
export function yearEndPackFiles(input: YearEndInput): Record<string, Uint8Array> {
  const { state, clientId, fy } = input;
  const client = state.clients.find((c) => c.id === clientId);
  const view = yearEndView(state, clientId, fy, input.now);
  const files: Record<string, Uint8Array> = {};
  for (const m of view.approvedMonths) {
    const pdfs: Record<string, PdfFile> = {};
    const snap = getMonth(state, clientId, m).snapshot;
    for (const s of snap?.statements ?? []) if (input.pdfsByStatement[s.id]) pdfs[s.id] = input.pdfsByStatement[s.id];
    const pack = auditPackFiles({ state, clientId, month: m, generatedAt: input.generatedAt, pdfs });
    for (const [name, data] of Object.entries(pack)) files[`${m}/${name}`] = data;
  }
  files["year-end-summary.html"] = strToU8(yearEndSummaryHtml(client?.name ?? clientId, view, input.generatedAt));
  files["year-end-summary.csv"] = strToU8(
    toCsv([
      ["Month", "Status", "Detail"],
      ...fy.months.map((m) => {
        if (view.approvedMonths.includes(m)) return [monthName(m), "Approved", "Audit pack included"];
        const n = view.notApproved.find((x) => x.month === m);
        return [monthName(m), n ? "Not approved" : "Not due yet", n?.reason ?? ""];
      }),
    ]),
  );
  files["README.txt"] = strToU8(
    [`Year-end pack: ${client?.name ?? clientId}`, view.fy.label, `Approved months with an audit pack: ${view.approvedMonths.length}`, `Months not yet approved: ${view.notApproved.length}`, "See year-end-summary.html for the list and the reason for each."].join("\r\n") + "\r\n",
  );
  return files;
}

export function yearEndPackZip(input: YearEndInput): Uint8Array {
  return zipSync(yearEndPackFiles(input), { level: 6 });
}

export function yearEndPackName(clientName: string, fy: FyRange): string {
  return `${safeName(clientName)}-year-end-${fy.endMonth}-pack.zip`;
}

export { monthIndex, nextMonth };
