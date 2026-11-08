import { NextResponse } from "next/server";
import { demoExtract, hasLiveExtraction, liveExtract } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File is larger than 8 MB" }, { status: 413 });
    }
    if (hasLiveExtraction()) {
      const bill = await liveExtract(file);
      return NextResponse.json({ mode: "live", bill });
    }
    return NextResponse.json({ mode: "demo", bill: demoExtract(file.name) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
