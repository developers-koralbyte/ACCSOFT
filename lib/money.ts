// Money is always integer sen (1 RM = 100 sen). Never store or add floats.

export function toSen(n: number): number {
  return Math.round(n * 100);
}

// Parses "1,020.00", "-45.5", "RM 12" into sen without going through floats. Returns null when it is not money.
export function parseSen(text: string): number | null {
  const t = text.replace(/RM/gi, "").replace(/[,\s]/g, "");
  const m = t.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const sen = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -sen : sen;
}

// "RM1,234.50" or "-RM1,234.50"
export function fmtRM(sen: number): string {
  const abs = Math.abs(sen);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sen < 0 ? "-" : ""}RM${whole}.${frac}`;
}

// Plain number for CSV and edit boxes: 1234.50
export function senToPlain(sen: number): string {
  const abs = Math.abs(sen);
  return `${sen < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// ISO YYYY-MM-DD to DD/MM/YYYY. Anything else is returned unchanged.
export function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-09" to "September 2026"
export function monthName(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

// "13/11/2026, 09:30" in the viewer's local time.
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// "RM199" when the amount is whole ringgit, otherwise "RM0.20". For price lists.
export function fmtRMShort(sen: number): string {
  return sen % 100 === 0 ? fmtRM(sen).replace(".00", "") : fmtRM(sen);
}
