import { NextResponse } from "next/server";
import { createDraftBill, validSession, xeroConfigured } from "@/lib/xero";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const bill = await req.json();
  const res = NextResponse.json({});

  // Demo mode: nothing is sent anywhere.
  if (!xeroConfigured()) {
    return NextResponse.json({ mode: "demo", ref: `DEMO-${Date.now().toString(36).toUpperCase()}` });
  }

  try {
    const session = await validSession(res);
    if (!session) {
      return NextResponse.json({ error: "Xero is not connected. Use Connect Xero first." }, { status: 401 });
    }
    const id = await createDraftBill(session, bill);
    const out = NextResponse.json({ mode: "live", ref: id || "created", organisation: session.tenantName });
    // carry over a refreshed cookie, if one was set
    const refreshed = res.cookies.getAll();
    refreshed.forEach((c) => out.cookies.set(c));
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Posting to Xero failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
