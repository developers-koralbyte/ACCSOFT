import { NextResponse } from "next/server";
import { liveStatementsAvailable, livePageExtract } from "@/lib/statements/live";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tells the browser whether live extraction of scanned pages is switched on.
export async function GET() {
  return NextResponse.json({ live: liveStatementsAvailable() });
}

// One scanned page image in, structured lines out. Never called for pages that have a text layer.
export async function POST(req: Request) {
  if (!liveStatementsAvailable()) {
    return NextResponse.json({ error: "Live extraction is not switched on. Scanned statements need an ANTHROPIC_API_KEY." }, { status: 501 });
  }
  try {
    const { image } = (await req.json()) as { image?: string };
    if (!image) return NextResponse.json({ error: "No page image received" }, { status: 400 });
    // a single page JPEG is far below the platform body limit, but keep a margin
    if (image.length > 4_000_000) return NextResponse.json({ error: "That page image is too large" }, { status: 413 });
    return NextResponse.json({ page: await livePageExtract(image) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 500 });
  }
}
