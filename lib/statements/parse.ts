import { parseSen } from "../money";
import type { Statement, StmtLine } from "./types";

// Turns the text layer of a digital bank statement (text plus x/y position) into statement lines.
// It is data driven rather than bank specific: transaction rows are found by their leading date and
// their money cells, and money columns are named from the header words that sit above them.

export interface TextItem {
  str: string;
  x: number; // left edge
  y: number; // baseline, larger is higher on the page
  w: number; // width
}
export interface PageText {
  page: number; // 1 based
  items: TextItem[];
}

export type ParsedStatement = Omit<Statement, "id" | "clientId" | "fileName" | "kind" | "addedAt">;

export interface ParseOutcome {
  ok: boolean;
  reason?: string;
  draft?: ParsedStatement;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}
interface Row {
  page: number;
  y: number;
  cells: Cell[];
  text: string;
}
interface Money {
  sen: number; // always positive
  mark: "+" | "-" | "CR" | "DR" | "";
  negative: boolean; // written with a minus sign or brackets
}

// ---------- low level helpers ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogos: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

const MONEY_RE = /^(?:RM\s?)?(\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?|\(?-?\d+\.\d{2}\)?)\s?(CR|DR|Cr|Dr|\+|-)?$/;
const MARK_ONLY_RE = /^(\+|-|CR|DR|Cr|Dr)$/;
const DATE_NUM = "(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?";
const DATE_TXT = "(\\d{1,2})[ \\-]([A-Za-z]{3,4})[A-Za-z]*(?:[ \\-,]+(\\d{2,4}))?";
const DATE_ONLY_RE = new RegExp(`^(?:${DATE_NUM}|${DATE_TXT})$`);
const DATE_LEAD_RE = new RegExp(`^(?:${DATE_NUM}|${DATE_TXT})\\s+(.+)$`);
const FULL_DATE_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;

function parseMoney(text: string): Money | null {
  const m = text.trim().match(MONEY_RE);
  if (!m) return null;
  const raw = m[1];
  const negative = raw.startsWith("-") || raw.startsWith("(-") || (raw.startsWith("(") && raw.endsWith(")"));
  const sen = parseSen(raw.replace(/[()-]/g, ""));
  if (sen === null) return null;
  const mark = (m[2] ?? "").toUpperCase() as Money["mark"];
  return { sen, mark, negative };
}

interface DateParts {
  d: number;
  m: number;
  y: number | null;
}

function parseDateParts(text: string): DateParts | null {
  const m = text.trim().match(DATE_ONLY_RE);
  if (!m) return null;
  return datePartsFromMatch(m);
}

function datePartsFromMatch(m: RegExpMatchArray): DateParts | null {
  let d: number;
  let mo: number;
  let y: string | undefined;
  if (m[1] !== undefined && m[2] !== undefined) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = m[3];
  } else {
    d = Number(m[4]);
    mo = MONTHS[(m[5] ?? "").toLowerCase().slice(0, 4)] ?? MONTHS[(m[5] ?? "").toLowerCase().slice(0, 3)];
    y = m[6];
  }
  if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const year = y === undefined ? null : y.length === 2 ? 2000 + Number(y) : Number(y);
  return { d, m: mo, y: year };
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function addDays(isoDate: string, days: number): string {
  const t = new Date(`${isoDate}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

// A stable short identity for an account number. The number itself is never kept.
export function accountIdentity(digits: string): { last4: string; key: string } {
  const only = digits.replace(/\D/g, "");
  let h = 2166136261;
  for (let i = 0; i < only.length; i++) h = Math.imul(h ^ only.charCodeAt(i), 16777619) >>> 0;
  const last4 = only.slice(-4) || "0000";
  return { last4, key: `${last4}:${h.toString(16).padStart(8, "0")}` };
}

// ---------- rows and cells ----------

export function buildRows(pages: PageText[]): Row[] {
  const rows: Row[] = [];
  for (const p of pages) {
    const items = p.items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: TextItem[][] = [];
    for (const it of items) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g[0].y - it.y) <= 2.5) g.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      g.sort((a, b) => a.x - b.x);
      let cells: Cell[] = [];
      for (const it of g) {
        const last = cells[cells.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        if (last && gap < 7) {
          last.text += (gap > 0.8 ? " " : "") + it.str.trim();
          last.x1 = it.x + it.w;
        } else {
          cells.push({ text: it.str.trim(), x0: it.x, x1: it.x + it.w });
        }
      }
      // a lone sign or CR/DR glued to the money cell before it
      cells = cells.reduce<Cell[]>((acc, c) => {
        const prev = acc[acc.length - 1];
        if (prev && MARK_ONLY_RE.test(c.text) && parseMoney(prev.text) && !/[+\-]$|CR$|DR$/i.test(prev.text) && c.x0 - prev.x1 < 14) {
          prev.text += c.text;
          prev.x1 = c.x1;
        } else acc.push(c);
        return acc;
      }, []);
      rows.push({ page: p.page, y: g[0].y, cells, text: cells.map((c) => c.text).join(" ") });
    }
  }
  return rows;
}

interface Tx {
  page: number;
  y: number;
  date: DateParts;
  descCells: Cell[];
  money: { money: Money; cell: Cell }[];
  extra: string[];
}

function leadingDate(row: Row): { date: DateParts; rest: Cell[] } | null {
  const c0 = row.cells[0];
  if (!c0) return null;
  const only = parseDateParts(c0.text);
  if (only) {
    let rest = row.cells.slice(1);
    // a second date cell (value date) is not part of the description
    if (rest[0] && parseDateParts(rest[0].text)) rest = rest.slice(1);
    return { date: only, rest };
  }
  const lead = c0.text.match(DATE_LEAD_RE);
  if (lead) {
    const d = datePartsFromMatch(lead as unknown as RegExpMatchArray);
    // DATE_LEAD_RE has the description as the last capture group
    if (d && !parseMoney(lead[lead.length - 1])) {
      return { date: d, rest: [{ text: lead[lead.length - 1], x0: c0.x0 + 1, x1: c0.x1 }, ...row.cells.slice(1)] };
    }
  }
  return null;
}

const HEADER_WORD = /\b(date|tarikh|description|butir|particulars|details|debit|credit|kredit|balance|baki|amount|jumlah|withdrawal|deposit|reference|cheque)\b/gi;

function isHeaderRow(row: Row): boolean {
  const words = new Set((row.text.match(HEADER_WORD) ?? []).map((w) => w.toLowerCase()));
  return words.size >= 2;
}

const STOP_RE = /^(total|ending|closing|ledger|baki|perhatian|note|page|muka|opening|beginning|statement|account|nombor|protected|all items|please|thank)/i;

// ---------- header facts ----------

const BANK_NAMES: [RegExp, string][] = [
  [/maybank/i, "Maybank"],
  [/cimb/i, "CIMB"],
  [/public bank/i, "Public Bank"],
  [/rhb/i, "RHB"],
  [/hong leong/i, "Hong Leong Bank"],
  [/ambank/i, "AmBank"],
  [/bank islam/i, "Bank Islam"],
  [/bank simpanan|\bbsn\b/i, "BSN"],
  [/\buob\b/i, "UOB"],
  [/ocbc/i, "OCBC"],
  [/hsbc/i, "HSBC"],
  [/affin/i, "Affin Bank"],
  [/alliance bank/i, "Alliance Bank"],
  [/standard chartered/i, "Standard Chartered"],
  [/bank rakyat/i, "Bank Rakyat"],
  [/\bmbsb\b/i, "MBSB Bank"],
];

function detectBank(headRows: Row[]): string {
  const text = headRows.map((r) => r.text).join("\n");
  for (const [re, name] of BANK_NAMES) if (re.test(text)) return name;
  for (const r of headRows.slice(0, 10)) {
    const m = r.text.match(/([A-Za-z][A-Za-z&.' ]{2,40}\b(?:Bank|Berhad|Bhd)\b[A-Za-z.' ]{0,12})/i);
    if (m) {
      const name = m[1].replace(/\s+/g, " ").trim();
      return name.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    }
  }
  return "Unknown bank";
}

const ACCOUNT_LABEL = /(account|akaun|a\/c|戶號|户号)/i;

function detectAccount(headRows: Row[]): string | null {
  const digits = (t: string) => t.replace(/\D/g, "");
  const looksAccount = (t: string) => /^\d[\d \-]{6,24}\d$/.test(t) && digits(t).length >= 8 && digits(t).length <= 18 && !parseDateParts(t) && !parseMoney(t);
  // 1. a label and a number on the same row, or within the next rows
  for (let i = 0; i < headRows.length; i++) {
    if (!ACCOUNT_LABEL.test(headRows[i].text)) continue;
    for (let j = i; j < Math.min(headRows.length, i + 5); j++) {
      const inline = headRows[j].text.match(/(\d[\d \-]{6,24}\d)/);
      for (const c of headRows[j].cells) if (looksAccount(c.text)) return c.text;
      if (inline && looksAccount(inline[1].trim())) return inline[1].trim();
    }
  }
  // 2. any account-looking cell before the table
  for (const r of headRows) for (const c of r.cells) if (looksAccount(c.text)) return c.text;
  return null;
}

interface PeriodGuess {
  start: string | null;
  end: string | null;
}

function detectPeriod(headRows: Row[]): PeriodGuess {
  const text = headRows.map((r) => r.text).join("\n");
  const range = text.match(
    new RegExp(`${DATE_NUM}\\s*(?:to|-|until|hingga|sehingga)\\s*${DATE_NUM}`, "i"),
  );
  if (range) {
    const a = { d: Number(range[1]), m: Number(range[2]), y: range[3] ? Number(range[3]) : null };
    const b = { d: Number(range[4]), m: Number(range[5]), y: range[6] ? Number(range[6]) : null };
    const norm = (y: number | null) => (y === null ? null : y < 100 ? 2000 + y : y);
    const ya = norm(a.y);
    const yb = norm(b.y);
    if (ya && yb) return { start: iso(ya, a.m, a.d), end: iso(yb, b.m, b.d) };
  }
  let best: string | null = null;
  for (const m of Array.from(text.matchAll(FULL_DATE_RE))) {
    const parts = datePartsFromMatch([m[0], m[1], m[2], m[3]] as unknown as RegExpMatchArray);
    if (!parts || parts.y === null) continue;
    const v = iso(parts.y, parts.m, parts.d);
    if (!best || v > best) best = v;
  }
  return { start: null, end: best };
}

// ---------- column roles ----------

type Role = "debit" | "credit" | "amount" | "balance";
interface Column {
  x1: number; // typical right edge
  lo: number;
  hi: number;
  role: Role | null;
}

function clusterColumns(edges: { x0: number; x1: number }[]): Column[] {
  const sorted = [...edges].sort((a, b) => a.x1 - b.x1);
  const cols: { edges: { x0: number; x1: number }[] }[] = [];
  for (const e of sorted) {
    const c = cols[cols.length - 1];
    if (c && e.x1 - c.edges[c.edges.length - 1].x1 <= 9) c.edges.push(e);
    else cols.push({ edges: [e] });
  }
  // ignore stray one-off clusters when real columns exist
  const max = Math.max(...cols.map((c) => c.edges.length));
  return cols
    .filter((c) => c.edges.length >= Math.max(1, Math.floor(max * 0.15)))
    .map((c) => ({
      x1: c.edges.reduce((a, e) => a + e.x1, 0) / c.edges.length,
      lo: Math.min(...c.edges.map((e) => e.x0)),
      hi: Math.max(...c.edges.map((e) => e.x1)),
      role: null,
    }));
}

function roleFromHeader(text: string): Role | null {
  if (/balance|baki|结余|結餘|存餘/i.test(text)) return "balance";
  if (/debit|withdraw|dr\b|keluar|pembayaran/i.test(text)) return "debit";
  if (/credit|kredit|deposit|\bcr\b|masuk\b(?!.*tarikh)/i.test(text)) return "credit";
  if (/amount|jumlah/i.test(text)) return "amount";
  return null;
}

function assignRoles(cols: Column[], headerRows: Row[], txRows: Tx[]): void {
  // Each header cell belongs to the one column it is closest to, so a wide header cannot name two columns.
  const texts: string[] = cols.map(() => "");
  for (const c of headerRows.flatMap((r) => r.cells)) {
    let best = -1;
    let dist = Infinity;
    cols.forEach((col, i) => {
      const colCentre = (col.lo + col.hi) / 2;
      const d = Math.min(Math.abs((c.x0 + c.x1) / 2 - colCentre), Math.abs(c.x1 - col.x1));
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best >= 0 && dist <= 70) texts[best] += ` ${c.text}`;
  }
  cols.forEach((col, i) => (col.role = roleFromHeader(texts[i])));
  // two columns with the same name means the header was ambiguous: decide from shape instead
  const named = cols.map((c) => c.role).filter(Boolean);
  if (new Set(named).size !== named.length) cols.forEach((c) => (c.role = null));
  // Header words can be missing or ambiguous, so fall back on shape.
  const unnamed = cols.filter((c) => !c.role);
  if (unnamed.length) {
    const marked = txRows.some((t) => t.money.some((m) => m.money.mark === "+" || m.money.mark === "-"));
    if (cols.length === 1) cols[0].role ??= "amount";
    else if (cols.length === 2) {
      if (!cols[0].role && !cols[1].role) {
        if (marked || txRows.length === 0) {
          cols[0].role = "amount";
          cols[1].role = "balance";
        } else {
          cols[0].role = "debit";
          cols[1].role = "credit";
        }
      } else {
        cols[0].role ??= cols[1].role === "balance" ? "amount" : "debit";
        cols[1].role ??= cols[0].role === "amount" ? "balance" : "credit";
      }
    } else if (cols.length >= 3) {
      const last3 = cols.slice(-3);
      last3[0].role ??= "debit";
      last3[1].role ??= "credit";
      last3[2].role ??= "balance";
    }
  }
}

// ---------- the parser ----------

export function parseStatementPages(pages: PageText[]): ParseOutcome {
  const rows = buildRows(pages);
  if (rows.length === 0) return { ok: false, reason: "no-text" };
  const warnings: string[] = [];

  // pass 1: find transaction rows and header rows
  const firstTxRowIdx = rows.findIndex((r) => {
    const lead = leadingDate(r);
    return lead && lead.rest.some((c) => parseMoney(c.text));
  });
  if (firstTxRowIdx === -1) return { ok: false, reason: "no-table" };

  const headRows = rows.slice(0, firstTxRowIdx).filter((r) => r.page === rows[0].page);
  const headerRows = rows.slice(0, firstTxRowIdx).filter((r) => isHeaderRow(r) || r.cells.length >= 2).slice(-8);

  const txs: Tx[] = [];
  let cur: Tx | null = null;
  let descX: number | null = null;
  let prevY: number | null = null;
  let prevPage = -1;
  let afterHeader = false;
  let opening: number | null = null;
  let closing: number | null = null;
  let closingFallback: number | null = null;
  const printed: { debit: number | null; credit: number | null } = { debit: null, credit: null };
  let openingRowBalance: Money | null = null;

  const moneyCells = (cells: Cell[]) => cells.map((c) => ({ cell: c, money: parseMoney(c.text) })).filter((x): x is { cell: Cell; money: Money } => x.money !== null);

  // the opening balance row sits above the first transaction, so scan from the top
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.page !== prevPage) {
      prevPage = row.page;
      prevY = null;
      afterHeader = false;
    }
    const lead = leadingDate(row);
    const monies = lead ? moneyCells(lead.rest) : moneyCells(row.cells);

    if (lead && monies.length > 0) {
      const descCells = lead.rest.filter((c) => !parseMoney(c.text) || c.x0 < Math.min(...monies.map((m) => m.cell.x0)) - 1).filter((c) => !monies.some((m) => m.cell === c));
      cur = { page: row.page, y: row.y, date: lead.date, descCells, money: monies.map((m) => ({ money: m.money, cell: m.cell })), extra: [] };
      if (descX === null && descCells[0]) descX = descCells[0].x0;
      txs.push(cur);
      prevY = row.y;
      afterHeader = false;
      continue;
    }

    const t = row.text;
    // opening, closing and printed totals: a label with money on the same row
    if (monies.length > 0 && !lead) {
      const m = monies[monies.length - 1].money;
      const signed = m.negative || m.mark === "DR" ? -m.sen : m.sen;
      if (/\b(beginning|opening|brought forward|b\/f|baki awal|baki bawa)/i.test(t)) {
        if (opening === null) {
          opening = signed;
          openingRowBalance = m;
        }
        continue;
      }
      if (/\b(total debit|jumlah debit|total withdrawals?)\b/i.test(t)) {
        printed.debit = m.sen;
        continue;
      }
      if (/\b(total credit|jumlah kredit|total deposits?)\b/i.test(t)) {
        printed.credit = m.sen;
        continue;
      }
      if (/\b(ending balance|closing balance|balance c\/f|carried forward|baki akhir|baki penutup)\b/i.test(t)) {
        closing = signed;
        continue;
      }
      if (/\bledger balance\b/i.test(t)) {
        closingFallback = signed;
        continue;
      }
      continue;
    }

    if (isHeaderRow(row)) {
      afterHeader = true;
      prevY = row.y;
      continue;
    }

    // description continuation lines
    if (cur && !lead && monies.length === 0 && descX !== null) {
      const first = row.cells[0];
      const aligned = first && first.x0 >= descX - 6 && first.x0 <= descX + 80;
      // after a page break a description may only continue below the repeated table header, never in the page banner
      const near = prevY !== null && prevY - row.y <= (afterHeader ? 34 : 22);
      const firstMoneyX = Math.min(...cur.money.map((m) => m.cell.x0));
      if (aligned && near && !STOP_RE.test(t) && cur.extra.length < 6 && first.x1 <= firstMoneyX + 4) {
        const text = row.cells.map((c) => c.text).join(" ").trim();
        if (text && text !== cur.extra[cur.extra.length - 1] && !/^[=.\-*]+$/.test(text)) cur.extra.push(text);
        prevY = row.y;
        afterHeader = false;
        continue;
      }
    }
    prevY = null;
  }

  if (txs.length === 0) return { ok: false, reason: "no-table" };

  // pass 2: money columns
  const edges = txs.flatMap((t) => t.money.map((m) => ({ x0: m.cell.x0, x1: m.cell.x1 })));
  if (openingRowBalance) {
    /* the opening row's figure sits in the balance column, which is already covered by the lines */
  }
  const cols = clusterColumns(edges).slice(-3);
  assignRoles(cols, headerRows, txs);
  const roleOf = (cell: Cell): Role | null => {
    let best: Column | null = null;
    let dist = Infinity;
    for (const c of cols) {
      const d = Math.abs(cell.x1 - c.x1);
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best && dist <= 24 ? best.role : null;
  };

  // statement date and period give every line its year
  const period = detectPeriod(headRows);
  let periodEnd = period.end;
  const explicitYears = txs.map((t) => t.date.y).filter((y): y is number => y !== null);
  if (!periodEnd && explicitYears.length === txs.length) {
    const last = txs[txs.length - 1].date;
    periodEnd = iso(last.y as number, last.m, last.d);
    warnings.push("The statement period was not printed, so it was taken from the last transaction date.");
  }
  if (!periodEnd) return { ok: false, reason: "no-period" };

  const endY = Number(periodEnd.slice(0, 4));
  const resolveDate = (d: DateParts): string => {
    if (d.y !== null) return iso(d.y, d.m, d.d);
    let candidate = iso(endY, d.m, d.d);
    if (candidate > addDays(periodEnd as string, 31)) candidate = iso(endY - 1, d.m, d.d);
    return candidate;
  };

  const lines: StmtLine[] = [];
  let prevBalance: number | null = opening;
  const directionNotes = { inferred: 0 };

  txs.forEach((t, idx) => {
    let debit = 0;
    let credit = 0;
    let balance: number | null = null;
    let inferred = false;
    let unsignedAmount: number | null = null;

    for (const { money, cell } of t.money) {
      const role = roleOf(cell);
      const signed = money.negative || money.mark === "DR" ? -money.sen : money.sen;
      if (role === "balance") balance = signed;
      else if (role === "debit") debit += money.sen;
      else if (role === "credit") credit += money.sen;
      else if (role === "amount") {
        if (money.mark === "+" || money.mark === "CR") credit += money.sen;
        else if (money.mark === "-" || money.mark === "DR" || money.negative) debit += money.sen;
        else unsignedAmount = money.sen;
      }
    }
    if (unsignedAmount !== null) {
      if (balance !== null && prevBalance !== null) {
        if (balance - prevBalance === unsignedAmount) credit += unsignedAmount;
        else if (prevBalance - balance === unsignedAmount) debit += unsignedAmount;
        else if (balance >= prevBalance) credit += unsignedAmount;
        else debit += unsignedAmount;
        inferred = true;
        directionNotes.inferred++;
      } else {
        debit += unsignedAmount;
        warnings.push(`Line ${idx + 1}: the amount has no sign and no balance to read the direction from, so it was treated as money out.`);
      }
    }
    if (balance !== null) prevBalance = balance;
    else if (prevBalance !== null) prevBalance = prevBalance + credit - debit;

    const typeText = t.descCells.map((c) => c.text).join(" ");
    const description = [typeText, ...t.extra].join(" ").replace(/\s+/g, " ").replace(/\s*[*]\s*$/, "").trim();
    lines.push({
      id: `l${idx + 1}`,
      date: resolveDate(t.date),
      description,
      debit,
      credit,
      balance,
      page: t.page,
      ...(inferred ? { directionInferred: true } : {}),
    });
  });
  if (directionNotes.inferred) {
    warnings.push(`${directionNotes.inferred} amounts had no sign, so money in or out was read from the change in running balance.`);
  }

  if (closing === null && closingFallback !== null) closing = closingFallback;
  if (opening === null) warnings.push("No opening balance row was found.");
  if (closing === null) warnings.push("No closing balance row was found.");

  const accountRaw = detectAccount(headRows);
  const id = accountIdentity(accountRaw ?? "");
  if (!accountRaw) warnings.push("The account number was not found.");

  const minLine = lines.reduce((a, l) => (l.date < a ? l.date : a), lines[0].date);
  let periodStart = period.start ?? `${periodEnd.slice(0, 8)}01`;
  if (!period.start && minLine < periodStart) periodStart = minLine;

  const draft: ParsedStatement = {
    bank: detectBank(headRows),
    accountLast4: accountRaw ? id.last4 : "----",
    accountKey: accountRaw ? id.key : "unknown",
    periodStart,
    periodEnd,
    opening,
    closing,
    printedTotals: printed.debit !== null || printed.credit !== null ? printed : undefined,
    lines,
    warnings,
  };
  return { ok: true, draft };
}

// True when a PDF's text clearly looks like a bank statement. Used to pick statements out of a WhatsApp export.
export function looksLikeStatement(pages: PageText[]): boolean {
  const out = parseStatementPages(pages.slice(0, 6));
  if (!out.ok || !out.draft) return false;
  return out.draft.lines.length >= 3 && out.draft.opening !== null && out.draft.closing !== null;
}
