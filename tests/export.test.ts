import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { seedState } from "@/lib/demo";
import { exportLines } from "@/lib/export/lines";
import { exportBankLines, genericCsv, quickbooksCsv, xeroStatementCsv } from "@/lib/export/formats";
import { DRAFT_PRESETS } from "@/lib/export/presets";
import { DRAFT_FILE_TAG, DRAFT_LABEL, LEDGERS } from "@/lib/export/ledgers";
import { approvedMonth, auditPackFiles, auditPackZip, isApproved, reconciliationHtml } from "@/lib/export/audit";
import { getMonth } from "@/lib/month/records";
import { approveMonth, prepareMonth, setBooksBalance } from "@/lib/month/signoff";
import { markBankOnly } from "@/lib/match/actions";
import { checkCap } from "@/lib/files";
import { MAX_FILE_BYTES, MAX_TOTAL_FILE_BYTES } from "@/lib/config";
import { STAFF } from "@/lib/staff";
import { baseState, bill, stmt } from "./helpers";

const [aisyah, daniel] = STAFF;
const AT = "2026-11-20T03:00:00Z";
const seeded = () => seedState();
const snapC3 = () => approvedMonth(seeded(), "c3", "2026-10").snapshot;

// a small approved month with a known statement, for exact checks
function approvedSmall(books?: number) {
  const s = stmt("oct", 5_000_000, [
    { date: "2026-10-09", desc: "TRANSFER TO A/C RIMAU TYRE CENTRE", debit: 120000 },
    { date: "2026-10-30", desc: "SERVICE CHARGE <b>FEE</b>", debit: 1500 },
    { date: "2026-10-31", desc: "PROFIT CREDIT PROFIT PAID", credit: 3120 },
  ]);
  let st = baseState({
    statements: [s],
    bills: [bill("b1", "Rimau Tyre Centre", "RT-5521", "2026-10-08", 1200, { account: "Motor vehicle and fuel" })],
    decisions: { ...markBankOnly({}, "oct:l2", "Bank charges", "NONE", "A"), ...markBankOnly({}, "oct:l3", "Interest income", "NONE", "A") },
  });
  st.clients[0] = { ...st.clients[0], ledger: "xero" };
  if (books !== undefined) st = setBooksBalance(st, "c1", "2026-10", "oct", books, aisyah, AT);
  const p = prepareMonth(st, "c1", "2026-10", aisyah, AT);
  if (!p.ok) throw new Error("not prepared");
  const a = approveMonth(p.state, "c1", "2026-10", daniel, { ackOutstanding: false, at: AT });
  if (!a.ok) throw new Error("not approved");
  return a.state;
}

describe("exports are only for approved months", () => {
  it("throws for a month that is not approved", () => {
    expect(() => approvedMonth(seeded(), "c5", "2026-10")).toThrow(/not approved/);
    expect(isApproved(seeded(), "c5", "2026-10")).toBe(false);
    expect(isApproved(seeded(), "c3", "2026-10")).toBe(true);
  });
  it("builds from the snapshot: later bill edits change nothing", () => {
    const st = seeded();
    const before = JSON.stringify(exportLines(approvedMonth(st, "c3", "2026-10").snapshot));
    const edited = { ...st, bills: st.bills.map((b) => ({ ...b, supplier: "Changed", total: 1 })) };
    expect(JSON.stringify(exportLines(approvedMonth(edited, "c3", "2026-10").snapshot))).toBe(before);
  });
});

describe("export lines", () => {
  const lines = exportLines(snapC3());
  it("carry category, tax code, matched document reference and the rule", () => {
    const tyre = lines.find((l) => l.description.includes("RIMAU"))!;
    expect(tyre).toMatchObject({ amount: -120000, debit: 120000, credit: 0, category: "Motor vehicle and fuel", taxCode: "NONE", payee: "Rimau Tyre Centre", reference: "RT-5521", stateLabel: "Matched" });
    expect(tyre.basis).toContain("Rule 2");
    const diesel = lines.find((l) => l.description.includes("BORNEO"))!;
    expect(diesel.basis).toContain("Rule 1");
    expect(diesel.reference).toBe("BDS-77412");
  });
  it("amounts are integer sen", () => {
    expect(lines.every((l) => Number.isInteger(l.amount) && Number.isInteger(l.debit) && Number.isInteger(l.credit))).toBe(true);
  });
  it("shows the tax rate in force without inventing a tax amount", () => {
    const l = lines.find((x) => x.taxCode === "NONE")!;
    expect(l.taxRate).toBe("0%");
    expect(Object.keys(l)).not.toContain("taxAmount");
  });
});

describe("Xero statement CSV", () => {
  const csv = xeroStatementCsv(exportLines(snapC3()));
  const rows = csv.replace("﻿", "").trim().split("\r\n");
  it("uses the standard statement import columns", () => {
    expect(rows[0]).toBe("*Date,*Amount,Payee,Description,Reference,Cheque Number");
  });
  it("money out is negative, money in positive, dates are DD/MM/YYYY, amounts exact", () => {
    expect(rows).toContain("09/10/2026,-1200.00,Rimau Tyre Centre,TRANSFER TO A/C RIMAU TYRE CENTRE,RT-5521,");
    expect(rows.some((r) => r.startsWith("03/10/2026,18000.00,"))).toBe(true);
    expect(rows.some((r) => r.startsWith("30/10/2026,-15.00,"))).toBe(true);
  });
  it("has one row per bank line", () => {
    expect(rows.length - 1).toBe(8);
  });
});

describe("QuickBooks CSV", () => {
  const lines = exportLines(snapC3());
  it("3 column layout: Date, Description, Amount", () => {
    const rows = quickbooksCsv(lines, 3).replace("﻿", "").trim().split("\r\n");
    expect(rows[0]).toBe("Date,Description,Amount");
    expect(rows).toContain("09/10/2026,TRANSFER TO A/C RIMAU TYRE CENTRE,-1200.00");
  });
  it("4 column layout: Date, Description, Credit, Debit", () => {
    const rows = quickbooksCsv(lines, 4).replace("﻿", "").trim().split("\r\n");
    expect(rows[0]).toBe("Date,Description,Credit,Debit");
    expect(rows).toContain("09/10/2026,TRANSFER TO A/C RIMAU TYRE CENTRE,,1200.00");
    expect(rows.some((r) => r.startsWith("03/10/2026,") && r.endsWith(",18000.00,"))).toBe(true);
  });
});

describe("draft ledger presets", () => {
  const lines = exportLines(snapC3());
  it.each(["sqlaccount", "autocount", "zoho"] as const)("%s is labelled a draft in the file name and the UI text", (id) => {
    const f = exportBankLines(id, lines, { clientName: "BlueRiver Logistics", month: "2026-10" });
    expect(f.draft).toBe(true);
    expect(f.fileName).toContain(DRAFT_FILE_TAG);
    expect(f.note).toContain(DRAFT_LABEL);
    expect(LEDGERS.find((l) => l.id === id)?.draft).toBe(true);
    const header = f.csv.replace("﻿", "").split("\r\n")[0].split(",");
    expect(header).toEqual(DRAFT_PRESETS.find((p) => p.id === id)!.columns.map((c) => c.header));
  });
  it("Xero, QuickBooks and Other are not drafts", () => {
    for (const l of ["xero", "quickbooks", "other"] as const) expect(exportBankLines(l, lines, { clientName: "X", month: "2026-10" }).draft).toBe(false);
  });
  it("the preset is a mapping: changing a column needs no code", () => {
    expect(DRAFT_PRESETS.every((p) => p.columns.every((c) => typeof c.header === "string" && typeof c.field === "string"))).toBe(true);
  });
});

describe("generic CSV", () => {
  it("has every field", () => {
    const header = genericCsv(exportLines(snapC3())).replace("﻿", "").split("\r\n")[0];
    for (const f of ["Category", "Tax code", "Document reference", "Matched documents", "Rule or person", "Client answer", "Category confirmed"]) expect(header).toContain(f);
  });
});

describe("balance per books and the reconciliation statement", () => {
  it("is titled a Bank statement review summary, with no books section, when no balance is entered", () => {
    const html = reconciliationHtml({ state: approvedSmall(), clientId: "c1", month: "2026-10", generatedAt: AT });
    expect(html).toContain("<h1>Bank statement review summary</h1>");
    expect(html).not.toContain("Balance per books");
    expect(html).not.toContain("Difference (bank less books)");
    expect(html).toContain("does not reconcile to the ledger");
  });
  it("shows balance per bank, balance per books and the difference when entered", () => {
    const st = approvedSmall(4_880_000);
    const html = reconciliationHtml({ state: st, clientId: "c1", month: "2026-10", generatedAt: AT });
    const closing = 5_000_000 - 120000 - 1500 + 3120; // RM48,816.20
    expect(html).toContain("<h1>Bank reconciliation statement</h1>");
    expect(html).toContain("Balance per bank at 28/10/2026");
    expect(html).toContain("RM48,816.20");
    expect(html).toContain("RM48,800.00");
    expect(html).toContain("Difference (bank less books)");
    expect(html).toContain("RM16.20"); // 4,881,620 - 4,880,000 = 1,620 sen
    expect(closing - 4_880_000).toBe(1620);
  });
  it("lists matched, bank only, answered and outstanding sections, and the sign-off", () => {
    const html = reconciliationHtml({ state: approvedSmall(), clientId: "c1", month: "2026-10", generatedAt: AT });
    for (const h of ["Items matched to documents (1)", "Bank only (2)", "Answered by the client (0)", "Outstanding at approval", "Prepared by", "Reviewed by", "Aisyah Rahman", "Daniel Lim", "Rule 2"]) expect(html).toContain(h);
  });
  it("escapes text from the data", () => {
    const html = reconciliationHtml({ state: approvedSmall(), clientId: "c1", month: "2026-10", generatedAt: AT });
    expect(html).toContain("SERVICE CHARGE &lt;b&gt;FEE&lt;/b&gt;");
    expect(html).not.toContain("<b>FEE</b>");
  });
  it("the books balance can be set and cleared before approval but not after", () => {
    let st = baseState();
    st = setBooksBalance(st, "c1", "2026-10", "oct", 123, aisyah, AT);
    expect(getMonth(st, "c1", "2026-10").booksBalance).toEqual({ oct: 123 });
    st = setBooksBalance(st, "c1", "2026-10", "oct", null, aisyah, AT);
    expect(getMonth(st, "c1", "2026-10").booksBalance).toEqual({});
    expect(st.activity.map((a) => a.kind)).toEqual(["books-balance", "books-balance"]);
    const done = approvedSmall(777);
    expect(setBooksBalance(done, "c1", "2026-10", "oct", 5, aisyah, AT)).toBe(done);
  });
});

describe("audit pack ZIP", () => {
  const st = approvedSmall(4_880_000);
  const pdf = new Uint8Array([37, 80, 68, 70, 45]);
  const zip = auditPackZip({ state: st, clientId: "c1", month: "2026-10", generatedAt: AT, pdfs: { oct: { name: "oct.pdf", data: pdf } } });
  const files = unzipSync(zip);
  it("contains every required file", () => {
    const names = Object.keys(files);
    for (const n of ["reconciliation-statement.html", "line-by-line.csv", "client-questions-and-answers.csv", "sign-off.csv", "activity-log.csv", "README.txt"]) expect(names).toContain(n);
    expect(names.some((n) => n.endsWith("xero-bank-statement.csv"))).toBe(true);
  });
  it("includes the source statement PDF where it is held, byte for byte", () => {
    const name = Object.keys(files).find((n) => n.startsWith("source-statements/"))!;
    expect(Array.from(files[name])).toEqual(Array.from(pdf));
  });
  it("says so when no file is held", () => {
    const f = auditPackFiles({ state: st, clientId: "c1", month: "2026-10", generatedAt: AT, pdfs: {} });
    expect(strFromU8(f["README.txt"])).toContain("No source statement PDFs are held");
    expect(Object.keys(f).some((n) => n.startsWith("source-statements/"))).toBe(false);
  });
  it("the line-by-line file names the rule or the person", () => {
    const csv = strFromU8(files["line-by-line.csv"]);
    expect(csv).toContain("Rule 2");
  });
  it("the sign-off and activity files carry names and times", () => {
    expect(strFromU8(files["sign-off.csv"])).toContain("Prepared by,Aisyah Rahman");
    expect(strFromU8(files["activity-log.csv"])).toContain("Daniel Lim");
  });
  it("a draft ledger puts the warning in the README and the file name", () => {
    const s = seedState();
    const z = auditPackFiles({ state: s, clientId: "c3", month: "2026-10", generatedAt: AT, pdfs: {} });
    expect(Object.keys(z).some((n) => n.includes(DRAFT_FILE_TAG))).toBe(false); // BlueRiver uses Xero
    const draftState = { ...s, clients: s.clients.map((c) => (c.id === "c3" ? { ...c, ledger: "zoho" as const } : c)) };
    const d = auditPackFiles({ state: draftState, clientId: "c3", month: "2026-10", generatedAt: AT, pdfs: {} });
    expect(Object.keys(d).some((n) => n.includes(DRAFT_FILE_TAG))).toBe(true);
    expect(strFromU8(d["README.txt"])).toContain("DRAFT TEMPLATE");
  });
  it("refuses a month that is not approved", () => {
    expect(() => auditPackZip({ state: seeded(), clientId: "c5", month: "2026-10", generatedAt: AT, pdfs: {} })).toThrow();
  });
});

describe("ledger seeds", () => {
  it("are a mix across the fictional clients", () => {
    const ledgers = seeded().clients.map((c) => c.ledger);
    expect(new Set(ledgers).size).toBeGreaterThanOrEqual(5);
    expect(ledgers).toContain("xero");
    expect(ledgers).toContain("zoho");
  });
});

describe("browser file storage limits", () => {
  it("accepts a normal file", () => {
    expect(checkCap(0, 1_000_000)).toEqual({ ok: true });
  });
  it("refuses an over-large file with a friendly message that says the figures still work", () => {
    const r = checkCap(0, MAX_FILE_BYTES + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("figures were still read");
  });
  it("refuses when the browser holds too much, and says what to do", () => {
    const r = checkCap(MAX_TOTAL_FILE_BYTES - 100, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Remove some files");
  });
});
