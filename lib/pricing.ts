// All pricing maths, in integer sen, in one tested place. Change a price here and nothing else.

export const PRICING = {
  firmBase: 19900, // RM199 per month
  includedClients: 10, // active clients included in the base price
  midRate: 2500, // RM25 per active client per month, clients 11 to 50
  midUpTo: 50,
  highRate: 2000, // RM20 per active client per month, from the 51st
  docsPerClient: 100, // documents included per client per month
  statementsPerClient: 4, // bank statements included per client per month
  extraDocument: 20, // RM0.20 per extra document
  yearEndPack: 15000, // RM150 per company, one-off
  businessFreeDocs: 30, // self-serve plan: free up to this many documents a month
  foundingFirms: 10,
  foundingFreeDays: 60,
  foundingDiscountPercent: 50,
  foundingDiscountMonths: 12,
};

export interface Line {
  label: string;
  clients: number;
  rate: number; // sen per client, or the base price for the base line
  amount: number; // sen
}

export interface Quote {
  activeClients: number;
  total: number; // sen per month
  perClient: number | null; // sen, rounded to the nearest sen, null with no clients
  lines: Line[];
  founding: number; // sen per month during the discounted 12 months
}

// An active client is one that sends at least one document or statement in the month.
export function firmQuote(activeClientsInput: number): Quote {
  const n = Number.isFinite(activeClientsInput) ? Math.max(0, Math.floor(activeClientsInput)) : 0;
  const p = PRICING;
  const lines: Line[] = [{ label: `Firm plan, includes ${p.includedClients} active clients`, clients: Math.min(n, p.includedClients), rate: p.firmBase, amount: p.firmBase }];
  const mid = Math.max(0, Math.min(n, p.midUpTo) - p.includedClients);
  const high = Math.max(0, n - p.midUpTo);
  if (mid > 0) lines.push({ label: `Clients ${p.includedClients + 1} to ${p.midUpTo}`, clients: mid, rate: p.midRate, amount: mid * p.midRate });
  if (high > 0) lines.push({ label: `Clients from ${p.midUpTo + 1}`, clients: high, rate: p.highRate, amount: high * p.highRate });
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return {
    activeClients: n,
    total,
    perClient: n > 0 ? Math.round(total / n) : null,
    lines,
    founding: Math.round((total * (100 - p.foundingDiscountPercent)) / 100),
  };
}

// Extra documents beyond what the clients' allowance covers.
export function extraDocumentsCost(activeClients: number, documentsSent: number): { extra: number; amount: number } {
  const included = Math.max(0, Math.floor(activeClients)) * PRICING.docsPerClient;
  const extra = Math.max(0, Math.floor(documentsSent) - included);
  return { extra, amount: extra * PRICING.extraDocument };
}
