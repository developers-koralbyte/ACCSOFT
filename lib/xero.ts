import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com";
const SCOPES = "offline_access accounting.transactions accounting.contacts accounting.settings.read";

export const COOKIE = "docflow_xero";

export interface XeroSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  tenantId: string;
  tenantName: string;
}

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI);
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID as string,
    redirect_uri: process.env.XERO_REDIRECT_URI as string,
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function basicAuth(): string {
  const raw = `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI as string,
    }),
  });
  if (!res.ok) throw new Error(`Xero token exchange failed (${res.status})`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refresh(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Xero token refresh failed (${res.status})`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function listConnections(accessToken: string) {
  const res = await fetch(`${API_BASE}/connections`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Xero connections lookup failed (${res.status})`);
  return res.json() as Promise<{ tenantId: string; tenantName: string }[]>;
}

export function sessionCookieValue(s: XeroSession): string {
  return Buffer.from(JSON.stringify(s)).toString("base64url");
}

export function readSession(): XeroSession | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as XeroSession;
  } catch {
    return null;
  }
}

// Returns a valid session, refreshing the token if needed. The refreshed cookie is attached to `res`.
export async function validSession(res: NextResponse): Promise<XeroSession | null> {
  const s = readSession();
  if (!s) return null;
  if (Date.now() < s.expiresAt - 60_000) return s;
  const t = await refresh(s.refreshToken);
  const next: XeroSession = {
    ...s,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
  res.cookies.set(COOKIE, sessionCookieValue(next), cookieOptions());
  return next;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

// Maps our tax codes to Xero tax types. Xero Malaysia organisations use their own
// tax rate names, so these are best-guess defaults and must be checked per organisation.
export const XERO_TAX_TYPE: Record<string, string> = {
  NONE: "NONE",
  SVC8: "INPUT",
  SVC6: "INPUT",
  ST10: "INPUT",
  ST5: "INPUT",
};

export async function createDraftBill(
  s: XeroSession,
  bill: {
    supplier: string;
    invoiceNo: string;
    date: string;
    currency: string;
    subtotal: number;
    tax: number;
    taxCode: string;
    account: string;
    description: string;
  },
) {
  const body = {
    Invoices: [
      {
        Type: "ACCPAY",
        Contact: { Name: bill.supplier },
        Date: bill.date,
        DueDate: bill.date,
        InvoiceNumber: bill.invoiceNo || undefined,
        CurrencyCode: bill.currency,
        Status: "DRAFT", // always draft: the accountant finalises inside Xero
        LineAmountTypes: "Exclusive",
        LineItems: [
          {
            Description: `${bill.description} (${bill.account})`,
            Quantity: 1,
            UnitAmount: bill.subtotal,
            TaxType: XERO_TAX_TYPE[bill.taxCode] || "NONE",
            TaxAmount: bill.tax,
          },
        ],
      },
    ],
  };
  const res = await fetch(`${API_BASE}/api.xro/2.0/Invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.accessToken}`,
      "xero-tenant-id": s.tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.Elements?.[0]?.ValidationErrors?.[0]?.Message || json?.Message || `Xero error ${res.status}`;
    throw new Error(msg);
  }
  return json?.Invoices?.[0]?.InvoiceID as string | undefined;
}
