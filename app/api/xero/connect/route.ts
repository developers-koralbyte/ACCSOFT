import { NextResponse } from "next/server";
import { authorizeUrl, xeroConfigured } from "@/lib/xero";

export const runtime = "nodejs";

export async function GET() {
  if (!xeroConfigured()) {
    return NextResponse.json(
      { error: "Xero is not configured. Add XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI to .env.local." },
      { status: 400 },
    );
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("docflow_xero_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
