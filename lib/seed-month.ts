import { addActivity } from "./activity";
import type { Bill, AppState } from "./types";
import { STAFF } from "./staff";
import { accountIdentity } from "./statements/parse";
import type { Statement, StmtLine } from "./statements/types";
import { markBankOnly } from "./match/actions";
import { approveMonth, prepareMonth } from "./month/signoff";
import { reconcileForClient } from "./month/snapshot";

// Seeded October statements for four of the six clients, at different stages, so the month board shows a realistic
// spread. Everything here is invented. Seri Murni and Lotus Kitchen start with NO statement on purpose: they are
// loaded live from the sample buttons during the demo. Pixel Orchard has no statement and has already been chased.

interface Ln {
  date: string;
  desc: string;
  debit?: number;
  credit?: number;
}

function mk(id: string, clientId: string, bank: string, layout: string, account: string, opening: number, lines: Ln[]): Statement {
  let bal = opening;
  const out: StmtLine[] = lines.map((l, i) => {
    bal += (l.credit ?? 0) - (l.debit ?? 0);
    return { id: `l${i + 1}`, date: l.date, description: l.desc, debit: l.debit ?? 0, credit: l.credit ?? 0, balance: bal, page: 1 };
  });
  const a = accountIdentity(account);
  return {
    id,
    clientId,
    bank,
    layout,
    accountLast4: a.last4,
    accountKey: a.key,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    opening,
    closing: bal,
    lines: out,
    fileName: "Seeded sample (no PDF)",
    kind: "sample",
    addedAt: "2026-11-02T00:00:00Z",
    warnings: [],
  };
}

const bill = (id: string, clientId: string, supplier: string, invoiceNo: string, date: string, total: number, account: string): Bill => ({
  id,
  clientId,
  supplier,
  invoiceNo,
  date,
  currency: "MYR",
  subtotal: total,
  tax: 0,
  total,
  taxCode: "NONE",
  account,
  description: "",
  confidence: 0.92,
  source: "whatsapp",
  status: "pending",
});

export const SEED_BILLS: Bill[] = [
  bill("b11", "c3", "Rimau Tyre Centre", "RT-5521", "2026-10-08", 1200, "Motor vehicle and fuel"),
  bill("b12", "c3", "Selatan Fleet Insurance", "SFI-3391", "2026-10-24", 2400, "General expenses"),
  bill("b13", "c4", "Pixel Print House", "PPH-882", "2026-09-20", 450, "Advertising and marketing"),
  bill("b14", "c5", "Dental Supplies My Sdn Bhd", "DSM-88120", "2026-10-05", 2150, "General expenses"),
  bill("b15", "c5", "Lembah Power Utilities", "LPU-77001-10", "2026-10-04", 640, "Utilities"),
];

const T = (d: string) => `2026-11-${d}Z`;

export function seedMonthData(base: AppState): AppState {
  const aisyah = STAFF[0];
  const daniel = STAFF[1];

  const statements: Statement[] = [
    // complete and approved
    mk("seed-c3-oct", "c3", "Bank A Berhad", "Bank A layout", "310099887766", 4250000, [
      { date: "2026-10-03", desc: "INTER-BANK PAYMENT INTO A/C TANJUNG FREIGHT CUSTOMER INV BR-2210-004", credit: 1800000 },
      { date: "2026-10-09", desc: "TRANSFER TO A/C RIMAU TYRE CENTRE", debit: 120000 },
      { date: "2026-10-14", desc: "INTER-BANK PAYMENT INTO A/C PANTAI CARGO SDN BHD INV BR-2210-007", credit: 950000 },
      { date: "2026-10-20", desc: "FPX PAYMENT BORNEO DIESEL SUPPLIES BDS-77412", debit: 326050 },
      { date: "2026-10-26", desc: "TRANSFER TO A/C SELATAN FLEET INSURANCE", debit: 240000 },
      { date: "2026-10-27", desc: "TRANSFER TO A/C PAYROLL OCT 2026 STAFF SALARIES", debit: 2200000 },
      { date: "2026-10-30", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1500 },
      { date: "2026-10-31", desc: "PROFIT CREDIT PROFIT PAID", credit: 3120 },
    ]),
    // in progress: a suggestion, a question sent, bank only lines to confirm
    mk("seed-c4-oct", "c4", "Bank B Berhad", "Bank B layout", "410022334455", 820000, [
      { date: "2026-10-05", desc: "INTER-BANK PAYMENT INTO A/C MERDEKA CAFE SDN BHD INV KD-1001", credit: 350000 },
      { date: "2026-10-12", desc: "FPX PAYMENT STUDIO SOFTWARE LICENCES LTD SSL-2210984", debit: 31212 },
      { date: "2026-10-14", desc: "DUITNOW QR PIXEL PRINT HOUSE", debit: 45000 },
      { date: "2026-10-15", desc: "TRANSFER TO A/C SEWA STUDIO RENT OCT", debit: 180000 },
      { date: "2026-10-19", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1000 },
      { date: "2026-10-30", desc: "PROFIT CREDIT PROFIT PAID", credit: 840 },
    ]),
    // fully reconciled, prepared by one person, waiting for the second
    mk("seed-c5-oct", "c5", "Bank A Berhad", "Bank A layout", "510055667788", 1500000, [
      { date: "2026-10-02", desc: "INTER-BANK PAYMENT INTO A/C CARD SETTLEMENT INV HD-1002", credit: 1250000 },
      { date: "2026-10-06", desc: "TRANSFER TO A/C DENTAL SUPPLIES MY SDN BHD DSM-88120", debit: 215000 },
      { date: "2026-10-10", desc: "JOMPAY LEMBAH POWER UTILITIES LPU-77001-10", debit: 64000 },
      { date: "2026-10-15", desc: "INTER-BANK PAYMENT INTO A/C CARD SETTLEMENT INV HD-1015", credit: 980000 },
      { date: "2026-10-27", desc: "TRANSFER TO A/C PAYROLL OCT 2026 STAFF SALARIES", debit: 980000 },
      { date: "2026-10-29", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1250 },
      { date: "2026-10-30", desc: "PROFIT CREDIT PROFIT PAID", credit: 1560 },
    ]),
  ];

  let s: AppState = { ...base, statements: [...base.statements, ...statements], bills: [...base.bills, ...SEED_BILLS] };

  // Aisyah confirmed every bank only category for BlueRiver and Harmoni Dental
  for (const [clientId, stmtId, at] of [["c3", "seed-c3-oct", T("03T08:00:00")], ["c5", "seed-c5-oct", T("09T03:30:00")]] as const) {
    const recon = reconcileForClient(s, clientId);
    for (const r of Array.from(recon.results.values())) {
      if (r.statementId !== stmtId || r.state !== "bank-only") continue;
      s = { ...s, decisions: markBankOnly(s.decisions, r.key, r.category, r.taxCode, aisyah.name, at) };
    }
    s = addActivity(s, { clientId, month: "2026-10", by: aisyah.name, kind: "bank-only", text: "Confirmed the category of every bank only line", at });
  }

  // Kenanga Design: the rent question was sent on 8 November
  s = { ...s, questions: { ...s.questions, "seed-c4-oct:l4": { key: "seed-c4-oct:l4", sentAt: T("08T03:00:00"), sentBy: aisyah.name } } };
  s = addActivity(s, { clientId: "c4", month: "2026-10", by: aisyah.name, kind: "question-sent", text: "Sent 1 question on WhatsApp in English", at: T("08T03:00:00") });

  // Pixel Orchard was chased on 6 November and nothing has come back
  s = { ...s, chases: { ...s.chases, "c6:2026-10": { clientId: "c6", month: "2026-10", at: T("06T02:00:00"), by: aisyah.name } } };
  s = addActivity(s, { clientId: "c6", month: "2026-10", by: aisyah.name, kind: "chase", text: "Chased 2 missing documents (Rent, Bank statement) on WhatsApp in Bahasa Malaysia", at: T("06T02:00:00") });

  // BlueRiver: prepared by Aisyah, approved by Daniel
  const prepared = prepareMonth(s, "c3", "2026-10", aisyah, T("04T01:15:00"));
  if (prepared.ok) s = prepared.state;
  const approved = approveMonth(s, "c3", "2026-10", daniel, { ackOutstanding: false, at: T("04T06:40:00") });
  if (approved.ok) s = approved.state;

  // Harmoni Dental: prepared by Aisyah, waiting for review
  const p5 = prepareMonth(s, "c5", "2026-10", aisyah, T("10T02:00:00"));
  if (p5.ok) s = p5.state;
  return s;
}
