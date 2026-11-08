import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, cookieOptions, exchangeCode, listConnections, sessionCookieValue } from "@/lib/xero";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get("docflow_xero_state")?.value;
  const home = new URL("/", url.origin);

  if (!code || !state || !expected || state !== expected) {
    home.searchParams.set("xero", "failed");
    return NextResponse.redirect(home);
  }

  try {
    const t = await exchangeCode(code);
    const connections = await listConnections(t.access_token);
    if (!connections.length) throw new Error("No Xero organisation was authorised");
    const first = connections[0];
    const res = NextResponse.redirect((() => { home.searchParams.set("xero", "connected"); return home; })());
    res.cookies.set(
      COOKIE,
      sessionCookieValue({
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        tenantId: first.tenantId,
        tenantName: first.tenantName,
      }),
      cookieOptions(),
    );
    res.cookies.delete("docflow_xero_state");
    return res;
  } catch {
    home.searchParams.set("xero", "failed");
    return NextResponse.redirect(home);
  }
}
