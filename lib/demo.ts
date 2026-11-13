import type { AppState, Bill, Client } from "./types";

// Every name, number and amount in this file is invented sample data.

const clients: Client[] = [
  { id: "c1", name: "Seri Murni Trading Sdn Bhd", phone: "60100000001", docsExpected: 42, docsReceived: 31 },
  { id: "c2", name: "Lotus Kitchen Enterprise", phone: "60100000002", docsExpected: 28, docsReceived: 28 },
  { id: "c3", name: "BlueRiver Logistics Sdn Bhd", phone: "60100000003", docsExpected: 55, docsReceived: 22 },
  { id: "c4", name: "Kenanga Design Studio", phone: "60100000004", docsExpected: 18, docsReceived: 12 },
  { id: "c5", name: "Harmoni Dental Clinic", phone: "60100000005", docsExpected: 34, docsReceived: 34 },
  { id: "c6", name: "Pixel Orchard Sdn Bhd", phone: "60100000006", docsExpected: 25, docsReceived: 9 },
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

// Documents for the sample bank statements: they line up with the October statement for Seri Murni Trading,
// so the matching demo has something real to match. Two documents have no payment yet, on purpose.
const bills: Bill[] = [
  mk("b1", "c1", "Lembah Power Utilities", "LPU-88213-10", "2026-09-29", 1480.0, 0, "Electricity bill", "email", 0.97, "Utilities", "NONE"),
  mk("b2", "c1", "Sinar Fuel Card Sdn Bhd", "SFC-5521907", "2026-10-01", 3312.75, 0, "Fleet fuel card statement", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"),
  mk("b3", "c1", "Kilat Broadband", "8810045512", "2026-10-05", 199.0, 15.92, "Business broadband monthly", "whatsapp", 0.9, "Telephone and internet", "SVC8"),
  mk("b4", "c1", "Bintang Stationery", "", "2026-10-14", 913.0, 0, "Stationery and printing paper", "whatsapp", 0.72, "Office supplies", "NONE"),
  mk("b5", "c1", "Tradewind Courier Sdn Bhd", "TC-90412", "2026-10-19", 600.0, 48.0, "Courier charges", "upload", 0.91, "Courier and postage", "SVC8"),
  mk("b6", "c1", "Mutiara Packaging Sdn Bhd", "MP-21377", "2026-10-21", 1150.0, 0, "Packaging materials", "whatsapp", 0.88, "General expenses", "NONE"),
  mk("b7", "c1", "Cahaya Printing Works", "CPW-4410", "2026-10-26", 380.0, 0, "Flyers and labels", "whatsapp", 0.8, "Advertising and marketing", "NONE"),
  mk("b8", "c3", "Borneo Diesel Supplies", "BDS-77412", "2026-10-30", 3260.5, 0, "Fleet diesel", "whatsapp", 0.93, "Motor vehicle and fuel", "NONE"),
  mk("b9", "c4", "Studio Software Licences Ltd", "SSL-2210984", "2026-10-26", 289.0, 23.12, "Design software team licence", "upload", 0.9, "Computer and software", "SVC8"),
  mk("b10", "c6", "Bazaar Online Marketplace", "BOM-7745120", "2026-10-31", 842.15, 67.37, "Commission and service fees", "whatsapp", 0.76, "Marketplace and platform fees", "SVC8"),
];

export function seedState(): AppState {
  return { clients, bills, statements: [] };
}

// "My business" mode starts empty: no sample documents, so nothing can be mistaken for real records.
export function seedBusinessState(): AppState {
  const mine: Client = { id: "me", name: "My business", phone: "", docsExpected: 0, docsReceived: 0 };
  return { clients: [mine], bills: [], statements: [] };
}
