import type { Bill } from "@/lib/types";
import type { Statement, StmtLine } from "@/lib/statements/types";

export interface L {
  date: string;
  desc: string;
  debit?: number;
  credit?: number;
}

// Builds a statement whose proof ties. withBalance false gives a totals-only statement.
export function stmt(id: string, opening: number, lines: L[], opts: { balance?: boolean; clientId?: string; month?: string; breakAt?: number } = {}): Statement {
  let bal = opening;
  const out: StmtLine[] = lines.map((l, i) => {
    bal += (l.credit ?? 0) - (l.debit ?? 0);
    return { id: `l${i + 1}`, date: l.date, description: l.desc, debit: l.debit ?? 0, credit: l.credit ?? 0, balance: opts.balance === false ? null : bal, page: 1 };
  });
  if (opts.breakAt !== undefined) out[opts.breakAt] = { ...out[opts.breakAt], debit: out[opts.breakAt].debit + 100 };
  const month = opts.month ?? lines[0].date.slice(0, 7);
  return {
    id,
    clientId: opts.clientId ?? "c1",
    bank: "Bank A",
    accountLast4: "4455",
    accountKey: "4455:test",
    periodStart: `${month}-01`,
    periodEnd: `${month}-28`,
    opening,
    closing: bal,
    lines: out,
    fileName: `${id}.pdf`,
    kind: "pdf-text",
    addedAt: "2026-11-01T00:00:00Z",
    warnings: [],
  };
}

export function bill(id: string, supplier: string, invoiceNo: string, date: string, total: number, extra: Partial<Bill> = {}): Bill {
  return {
    id,
    clientId: "c1",
    supplier,
    invoiceNo,
    date,
    currency: "MYR",
    subtotal: total,
    tax: 0,
    total,
    taxCode: "NONE",
    account: "General expenses",
    description: "",
    confidence: 0.9,
    source: "upload",
    status: "pending",
    ...extra,
  };
}
