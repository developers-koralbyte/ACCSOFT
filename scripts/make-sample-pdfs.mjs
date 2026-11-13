// Generates the fictional sample statement PDFs in public/samples and the expected results in data/sample-expected.json.
// Run with: node scripts/make-sample-pdfs.mjs
// No dependencies: it writes a small, valid PDF with a real text layer, so the upload path is genuinely exercised.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "data/sample-plan.json"), "utf8"));

const PAGE_W = 595;
const PAGE_H = 842;

// ---- money helpers (integer sen) ----
const money = (sen) => {
  const abs = Math.abs(sen);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${String(abs % 100).padStart(2, "0")}`;
};
const balText = (sen) => (sen < 0 ? `${money(sen)}DR` : money(sen));

// ---- text width (Helvetica, enough for right aligning figures) ----
function width(text, size, bold) {
  let units = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) units += 556;
    else if (ch === "." || ch === "," || ch === " " || ch === ":") units += 278;
    else if (ch === "+") units += 584;
    else if (ch === "-") units += 333;
    else if (/[A-Z]/.test(ch)) units += bold ? 722 : 667;
    else units += bold ? 611 : 556;
  }
  return (units * size) / 1000;
}
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

class Page {
  constructor() {
    this.ops = [];
  }
  text(x, y, str, size = 8, bold = false) {
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(str)}) Tj ET`);
  }
  right(xr, y, str, size = 8, bold = false) {
    this.text(xr - width(str, size, bold), y, str, size, bold);
  }
  line(x1, y1, x2, y2) {
    this.ops.push(`0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
}

function writePdf(pages, title) {
  const objs = [];
  const add = (s) => {
    objs.push(s);
    return objs.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add(""); // 2, filled below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4
  add(`<< /Title (${esc(title)}) /Producer (DocFlow sample generator) >>`); // 5
  const kids = [];
  for (const p of pages) {
    const stream = p.ops.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const page = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`,
    );
    kids.push(`${page} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const dd = (iso) => iso.slice(8, 10);
const mm = (iso) => iso.slice(5, 7);
const yyyy = (iso) => iso.slice(0, 4);

// ---- compute balances ----
const byId = new Map();
for (const s of plan.statements) {
  const opening = s.openingFrom ? byId.get(s.openingFrom).closing : s.opening;
  let bal = opening;
  const rows = s.lines.map((l) => {
    const debit = l.debit ?? 0;
    const credit = l.credit ?? 0;
    bal += credit - debit;
    return { ...l, debit, credit, balance: bal };
  });
  byId.set(s.id, { ...s, opening, closing: bal, rows });
}

// ---- layout A: signed single amount column plus running balance, DD/MM dates, wrapped descriptions ----
function layoutA(s) {
  const X = { date: 40, desc: 120, amt: 440, bal: 540 };
  const flat = []; // rows laid out top to bottom, may break across pages mid description
  flat.push({ kind: "open" });
  for (const r of s.rows) {
    flat.push({ kind: "tx", r });
    for (const d of r.desc) flat.push({ kind: "desc", text: d });
  }
  const pages = [];
  let page;
  let y;
  let pageNo = 0;
  let lastTx = null;
  const stmtDate = `${dd(s.periodEnd)}/${mm(s.periodEnd)}/${yyyy(s.periodEnd).slice(2)}`;
  const header = () => {
    page = new Page();
    pages.push(page);
    pageNo++;
    page.text(PAGE_W / 2 - 80, 800, s.bankLine, 10, true);
    page.text(PAGE_W / 2 - 110, 788, "SAMPLE STATEMENT, FICTIONAL DATA FOR DEMONSTRATION ONLY", 7);
    page.text(40, 750, s.company, 9, true);
    s.address.forEach((a, i) => page.text(40, 738 - i * 11, a, 8));
    page.text(380, 750, "PAGE", 8);
    page.text(480, 750, `:  ${pageNo}`, 8);
    page.text(380, 736, "STATEMENT DATE", 8);
    page.text(480, 736, `:  ${stmtDate}`, 8);
    page.text(380, 722, "ACCOUNT NUMBER", 8);
    page.text(480, 722, `:  ${s.account}`, 8);
    page.text(430, 700, "CURRENT ACCOUNT", 8, true);
    page.line(40, 668, 555, 668);
    page.text(X.date, 656, "ENTRY DATE", 7, true);
    page.text(X.date + 60, 656, "VALUE DATE", 7, true);
    page.text(X.desc + 60, 656, "TRANSACTION DESCRIPTION", 7, true);
    page.right(X.amt + 20, 656, "TRANSACTION AMOUNT", 7, true);
    page.right(X.bal, 656, "STATEMENT BALANCE", 7, true);
    page.line(40, 650, 555, 650);
    y = 636;
  };
  const footer = () => {
    page.line(40, 96, 555, 96);
    page.text(40, 84, "LEDGER BALANCE", 7, true);
    page.text(180, 84, "ENDING BALANCE - UNCLEARED CHEQUES", 7);
    page.text(40, 70, "Note: all items and balances shown will be considered correct unless the bank is notified in writing within 21 days.", 6);
    page.text(40, 60, "This is a fictional sample statement created for product demonstration.", 6);
  };
  header();
  let rowsOnPage = 0;
  const max = s.maxRowsPerPage;
  for (const f of flat) {
    if (y < 120 || rowsOnPage >= max) {
      footer();
      header();
      rowsOnPage = 0;
      // the bank repeats the last description line when it carries over a page
      if (f.kind === "desc" && lastTx) {
        page.text(X.desc, y, lastTx.lastDesc ?? f.text, 8);
        y -= 12;
        rowsOnPage++;
      }
    }
    if (f.kind === "open") {
      page.text(X.desc, y, "BEGINNING BALANCE", 8, true);
      page.right(X.bal, y, balText(s.opening), 8, true);
      y -= 14;
    } else if (f.kind === "tx") {
      const r = f.r;
      const shown = r.printedAmount ?? (r.credit || r.debit);
      page.text(X.date, y, `${dd(r.date)}/${mm(r.date)}`, 8);
      page.text(X.desc, y, r.type, 8);
      page.right(X.amt + 20, y, `${money(shown)}${r.credit ? "+" : "-"}`, 8);
      page.right(X.bal, y, balText(r.balance), 8);
      lastTx = { lastDesc: r.desc[r.desc.length - 1] };
      y -= 12;
      rowsOnPage++;
    } else {
      page.text(X.desc + 6, y, f.text, 8);
      lastTx = { ...(lastTx ?? {}), lastDesc: f.text };
      y -= 12;
      rowsOnPage++;
    }
  }
  y -= 8;
  page.text(X.desc, y, "ENDING BALANCE :", 8, true);
  page.right(X.bal, y, balText(s.closing), 8, true);
  y -= 22;
  const td = s.rows.reduce((a, r) => a + r.debit, 0);
  const tc = s.rows.reduce((a, r) => a + r.credit, 0);
  page.text(X.desc, y, "LEDGER BALANCE :", 8);
  page.right(X.bal, y, balText(s.closing), 8);
  y -= 12;
  page.text(X.desc, y, "TOTAL DEBIT :", 8);
  page.right(X.bal, y, money(td), 8);
  y -= 12;
  page.text(X.desc, y, "TOTAL CREDIT :", 8);
  page.right(X.bal, y, money(tc), 8);
  footer();
  return pages;
}

// ---- layout B: separate debit and credit columns, DD/MM/YYYY dates, one line per transaction ----
function layoutB(s) {
  const X = { date: 40, desc: 120, debit: 400, credit: 470, bal: 550 };
  const pages = [];
  let page;
  let y;
  let n = 0;
  const header = () => {
    page = new Page();
    pages.push(page);
    n++;
    page.text(40, 800, s.bankLine, 12, true);
    page.text(40, 786, "SAMPLE STATEMENT, FICTIONAL DATA FOR DEMONSTRATION ONLY", 7);
    page.text(40, 760, s.company, 10, true);
    s.address.forEach((a, i) => page.text(40, 746 - i * 11, a, 8));
    const acct = s.account.replace(/(\d{4})(?=\d)/g, "$1 ");
    page.text(360, 760, `Account No: ${acct}`, 8);
    page.text(360, 748, `Statement period: ${dd(s.periodStart)}/${mm(s.periodStart)}/${yyyy(s.periodStart)} to ${dd(s.periodEnd)}/${mm(s.periodEnd)}/${yyyy(s.periodEnd)}`, 8);
    page.text(360, 736, `Page ${n}`, 8);
    page.line(40, 700, 555, 700);
    page.text(X.date, 688, "Date", 8, true);
    page.text(X.desc, 688, "Particulars", 8, true);
    page.right(X.debit, 688, "Debit (RM)", 8, true);
    page.right(X.credit, 688, "Credit (RM)", 8, true);
    page.right(X.bal, 688, "Balance (RM)", 8, true);
    page.line(40, 682, 555, 682);
    y = 668;
  };
  header();
  page.text(X.desc, y, "Opening Balance", 8, true);
  page.right(X.bal, y, balText(s.opening), 8, true);
  y -= 16;
  for (const r of s.rows) {
    if (y < 90) {
      header();
    }
    const shown = r.printedAmount ?? (r.credit || r.debit);
    page.text(X.date, y, `${dd(r.date)}/${mm(r.date)}/${yyyy(r.date)}`, 8);
    page.text(X.desc, y, `${r.type} ${r.desc.join(" ")}`, 8);
    if (r.debit) page.right(X.debit, y, money(shown), 8);
    if (r.credit) page.right(X.credit, y, money(shown), 8);
    page.right(X.bal, y, balText(r.balance), 8);
    y -= 14;
  }
  y -= 6;
  page.text(X.desc, y, "Closing Balance", 8, true);
  page.right(X.bal, y, balText(s.closing), 8, true);
  page.text(40, 60, "This is a fictional sample statement created for product demonstration.", 6);
  return pages;
}

const expected = {};
fs.mkdirSync(path.join(root, "public/samples"), { recursive: true });
for (const s of byId.values()) {
  const pages = s.layout === "A" ? layoutA(s) : layoutB(s);
  fs.writeFileSync(path.join(root, "public/samples", s.file), writePdf(pages, s.title));
  const brokenIdx = s.rows.findIndex((r) => r.printedAmount !== undefined);
  expected[s.id] = {
    file: s.file,
    title: s.title,
    clientId: s.clientId,
    layout: s.layout,
    accountLast4: s.account.slice(-4),
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    opening: s.opening,
    closing: s.closing,
    lineCount: s.rows.length,
    pages: pages.length,
    status: brokenIdx >= 0 ? "break" : "proven",
    breakLineNo: brokenIdx >= 0 ? brokenIdx + 1 : null,
    impliedAmount: brokenIdx >= 0 ? s.rows[brokenIdx].debit || s.rows[brokenIdx].credit : null,
    totalDebit: s.rows.reduce((a, r) => a + r.debit, 0),
    totalCredit: s.rows.reduce((a, r) => a + r.credit, 0),
  };
  console.log(`${s.file}: ${pages.length} page(s), ${s.rows.length} lines, closing ${money(s.closing)}`);
}
fs.writeFileSync(path.join(root, "data/sample-expected.json"), JSON.stringify(expected, null, 2) + "\n");
