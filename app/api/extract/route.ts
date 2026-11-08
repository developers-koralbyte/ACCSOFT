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
    // Vercel rejects request bodies over about 4.5 MB, so keep a safe margin
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "File is larger than 4 MB. Try a smaller photo or a screenshot." }, { status: 413 });
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
