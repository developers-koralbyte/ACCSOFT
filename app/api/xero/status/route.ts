import { NextResponse } from "next/server";
import { readSession, xeroConfigured } from "@/lib/xero";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = readSession();
  return NextResponse.json({
    configured: xeroConfigured(),
    connected: Boolean(s),
    organisation: s?.tenantName ?? null,
  });
}
