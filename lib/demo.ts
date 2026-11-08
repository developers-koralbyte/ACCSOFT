import type { AppState, Bill, Client } from "./types";
import { toBillFields } from "./malaysia";

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
): Bill {
  const e = { supplier, invoiceNo, date, currency: "MYR", subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100, description, confidence };
  return {
    id,
    clientId,
    ...e,
    ...toBillFields(e),
    source,
    status: "pending",
  };
}

const bills: Bill[] = [
  mk("b1", "c1", "Tenaga Nasional Berhad", "TNB-88213-10", "2026-10-28", 1480.0, 0, "Electricity bill October 2026", "email", 0.97),
  mk("b2", "c3", "Petronas Dagangan Berhad", "PDB-5521907", "2026-10-30", 3260.5, 0, "Fleet fuel card statement", "whatsapp", 0.93),
  mk("b3", "c4", "Adobe Systems Software Ireland", "IE-2210984", "2026-10-26", 289.0, 23.12, "Creative Cloud annual team licence", "upload", 0.9),
  mk("b4", "c6", "Shopee Malaysia", "SPE-MY-7745120", "2026-10-31", 842.15, 67.37, "Commission and service fees", "whatsapp", 0.76),
  mk("b5", "c1", "Unifi Business (Telekom Malaysia)", "", "2026-10-29", 199.0, 15.92, "Business broadband monthly", "whatsapp", 0.68),
];

export function seedState(): AppState {
  return { clients, bills };
}
