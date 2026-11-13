import type { AppState, Bill, Client } from "./types";
import type { HistoryItem, Lang } from "./chase/types";

// Every name, number and amount in this file is invented sample data.

const lang = (l: Lang) => l;
const clients: Client[] = [
  { id: "c1", name: "Seri Murni Trading Sdn Bhd", phone: "60100000001", docsExpected: 42, docsReceived: 31, language: lang("en") },
  { id: "c2", name: "Lotus Kitchen Enterprise", phone: "60100000002", docsExpected: 28, docsReceived: 28, language: lang("ms") },
  { id: "c3", name: "BlueRiver Logistics Sdn Bhd", phone: "60100000003", docsExpected: 55, docsReceived: 22, language: lang("en") },
  { id: "c4", name: "Kenanga Design Studio", phone: "60100000004", docsExpected: 18, docsReceived: 12, language: lang("en") },
  { id: "c5", name: "Harmoni Dental Clinic", phone: "60100000005", docsExpected: 34, docsReceived: 34, language: lang("zh") },
  { id: "c6", name: "Pixel Orchard Sdn Bhd", phone: "60100000006", docsExpected: 25, docsReceived: 9, language: lang("ms") },
];

// What each client sent in earlier months, so the missing-documents chaser has something to compare against.
// In a real build this comes from the document store.
function hist(clientId: string, months: string[], kinds: string[]): HistoryItem[] {
  return months.flatMap((month) => kinds.map((kind) => ({ clientId, month, kind, label: kind })));
}
const EARLIER = ["2026-07", "2026-08", "2026-09"];
const history: HistoryItem[] = [
  ...hist("c1", EARLIER, ["Rent", "Utilities", "Bank statement"]),
  ...hist("c1", ["2026-10"], ["Utilities"]),
  ...hist("c2", EARLIER, ["Utilities", "Bank statement"]),
  ...hist("c3", EARLIER, ["Rent", "Bank statement"]),
  ...hist("c3", ["2026-10"], ["Rent"]),
  ...hist("c4", EARLIER, ["Rent", "Bank statement"]),
  ...hist("c5", EARLIER, ["Utilities", "Telephone and internet", "Bank statement"]),
  ...hist("c5", ["2026-10"], ["Utilities", "Telephone and internet"]),
  ...hist("c6", EARLIER, ["Rent", "Utilities", "Bank statement"]),
];

function mk(
  id: string,
  clientId: string,
  supplier: string,
  invoiceNo: string,
  date: string,
  subtotal: number,
  tax: number,
  description: string,
  source: Bill["source"],
  confidence: number,
  account: string,
  taxCode: string,
): Bill {
  return {
    id,
    clientId,
    supplier,
    invoiceNo,
    date,
    currency: "MYR",
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    description,
    confidence,
    account,
    taxCode,
    source,
    status: "pending",
  };
}

// Documents for the sample bank statements. They line up with the September and October statements for Seri Murni
// Trading, so the matching demo shows every state. One document (Cahaya Printing) has no payment yet, on purpose.
// Broadband and courier suppliers sell IT support and design services here, which are taxed at 8%.
const bills: Bill[] = [
  // September documents
  mk("s1", "c1", "Lembah Power Utilities", "LPU-88213-09", "2026-08-30", 1480.0, 0, "Electricity bill", "email", 0.97, "Utilities", "NONE"),
  mk("s2", "c1", "Sinar Fuel Card Sdn Bhd", "SFC-5498811", "2026-09-01", 3260.5, 0, "Fleet fuel card statement", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"),
  mk("s3", "c1", "Kilat Broadband", "8810045499", "2026-09-04", 199.0, 15.92, "IT support and managed network services", "whatsapp", 0.9, "Computer and software", "SVC8"),
  mk("s4", "c1", "Bintang Stationery", "", "2026-08-20", 875.0, 0, "Stationery and printing paper", "whatsapp", 0.74, "Office supplies", "NONE"),
  mk("s5", "c1", "Mutiara Packaging Sdn Bhd", "MP-20933", "2026-09-20", 960.0, 0, "Packaging materials", "upload", 0.88, "General expenses", "NONE"),
  // October documents
  mk("b1", "c1", "Lembah Power Utilities", "LPU-88213-10", "2026-09-29", 1480.0, 0, "Electricity bill", "email", 0.97, "Utilities", "NONE"),
  mk("b2", "c1", "Sinar Fuel Card Sdn Bhd", "SFC-5521907", "2026-10-01", 3312.75, 0, "Fleet fuel card statement", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"),
  mk("b3", "c1", "Kilat Broadband", "8810045512", "2026-10-05", 199.0, 15.92, "IT support and managed network services", "whatsapp", 0.9, "Computer and software", "SVC8"),
  mk("b4", "c1", "Bintang Stationery", "", "2026-10-02", 913.0, 0, "Stationery and printing paper", "whatsapp", 0.72, "Office supplies", "NONE"),
  mk("b5", "c1", "Tradewind Courier Sdn Bhd", "TC-90412", "2026-10-19", 600.0, 48.0, "Graphic design and branding services", "upload", 0.91, "Advertising and marketing", "SVC8"),
  mk("b6", "c1", "Mutiara Packaging Sdn Bhd", "MP-21377", "2026-10-21", 1150.0, 0, "Packaging materials", "whatsapp", 0.88, "General expenses", "NONE"),
  mk("b7", "c1", "Cahaya Printing Works", "CPW-4410", "2026-10-26", 380.0, 0, "Flyers and labels", "whatsapp", 0.8, "Advertising and marketing", "NONE"),
  // other clients
  mk("b8", "c3", "Borneo Diesel Supplies", "BDS-77412", "2026-10-30", 3260.5, 0, "Fleet diesel", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"),
  mk("b9", "c4", "Studio Software Licences Ltd", "SSL-2210984", "2026-10-26", 289.0, 23.12, "Design software team licence", "upload", 0.9, "Computer and software", "SVC8"),
  mk("b10", "c6", "Bazaar Online Marketplace", "BOM-7745120", "2026-10-31", 842.15, 67.37, "Commission and service fees", "whatsapp", 0.76, "Marketplace and platform fees", "SVC8"),
];

function emptyExtras() {
  return { statements: [], decisions: {}, memory: {}, modelSuggestions: [], questions: {}, history: [], chases: {}, months: {}, activity: [] };
}

export function seedState(): AppState {
  return { clients, bills, ...emptyExtras(), history };
}

// "My business" mode starts with a few clearly labelled sample documents so the screens are not empty.
// Everything here is invented. The Clear samples button removes exactly these.
export function seedBusinessState(): AppState {
  const mine: Client = { id: "me", name: "My business", phone: "", docsExpected: 0, docsReceived: 5 };
  const s = (b: Bill, sentBy: string, status: Bill["status"] = "pending"): Bill => ({ ...b, sample: true, sentBy, status });
  const list: Bill[] = [
    s(mk("m1", "me", "Mesra Fuel Kiosk", "MFK-9921307", "2026-11-02", 120.0, 0, "Fuel for delivery van", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"), "Ahmad (driver)"),
    s(mk("m2", "me", "Rimba Online Marketplace", "ROM-8120456", "2026-11-03", 412.8, 33.02, "Commission and service fees", "whatsapp", 0.81, "Marketplace and platform fees", "SVC8"), "Siti"),
    s(mk("m3", "me", "Selera Packaging Supplies", "SPS-55120", "2026-10-30", 86.5, 0, "Packing tape and boxes", "whatsapp", 0.94, "Office supplies", "NONE"), "Ahmad (driver)", "approved"),
    s(mk("m4", "me", "Lembah Power Utilities", "LPU-90311-10", "2026-10-28", 980.4, 0, "Electricity bill October 2026", "whatsapp", 0.97, "Utilities", "NONE"), "Siti", "approved"),
    s(mk("m5", "me", "Cahaya Print Studio", "CPS-2218", "2026-10-27", 54.0, 0, "Price labels", "whatsapp", 0.9, "Advertising and marketing", "NONE"), "Ahmad (driver)", "posted"),
  ];
  list[4].postedRef = "DEMO-ZK31";
  return { clients: [mine], bills: list, ...emptyExtras() };
}

// Removes sample documents and sample statements, and anything a person decided about those statements.
export function clearSamples(state: AppState): AppState {
  const gone = new Set(state.statements.filter((x) => x.kind === "sample").map((x) => x.id));
  const decisions = Object.fromEntries(Object.entries(state.decisions).filter(([k]) => !gone.has(k.split(":")[0])));
  const bills = state.bills.filter((b) => !b.sample);
  const removed = state.bills.length - bills.length;
  return {
    ...state,
    bills,
    statements: state.statements.filter((x) => x.kind !== "sample"),
    decisions,
    clients: state.clients.map((c) => (c.id === "me" ? { ...c, docsReceived: Math.max(0, c.docsReceived - removed) } : c)),
  };
}
