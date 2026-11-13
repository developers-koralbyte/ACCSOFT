import { NextResponse } from "next/server";
import { liveStatementsAvailable } from "@/lib/statements/live";
import { liveMatchSuggestions } from "@/lib/match/live";

export const runtime = "nodejs";
export const maxDuration = 60;

// Model suggestions for lines the rules could not match. Only available with an API key.
// The browser validates the answer (exact sums in sen) before showing anything, and never applies it automatically.
export async function POST(req: Request) {
  if (!liveStatementsAvailable()) {
    return NextResponse.json({ error: "Model suggestions need an ANTHROPIC_API_KEY. The rule based matching above works without one." }, { status: 501 });
  }
  try {
    const body = await req.json();
    if (!Array.isArray(body?.lines) || !Array.isArray(body?.documents)) {
      return NextResponse.json({ error: "Expected lines and documents" }, { status: 400 });
    }
    if (body.lines.length > 200 || body.documents.length > 300) {
      return NextResponse.json({ error: "Too many lines or documents for one request" }, { status: 413 });
    }
    return NextResponse.json({ suggestions: await liveMatchSuggestions(body) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Suggestion request failed" }, { status: 500 });
  }
}
