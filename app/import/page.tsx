"use client";

import { useMemo, useState } from "react";
import { unzipSync } from "fflate";
import { useDocflow } from "@/lib/store";
import { toBillFields } from "@/lib/malaysia";
import { extractFile } from "@/lib/client";
import type { Bill } from "@/lib/types";

const MAX_FILES = 40;
const MEDIA = /\.(jpe?g|png|webp|pdf)$/i;

interface Found {
  name: string; // file name inside the zip
  path: string;
  sender: string;
  month: string; // YYYY-MM or "unknown"
  data: Uint8Array;
}

function baseName(path: string) {
  return path.split("/").pop() || path;
}

function mimeFor(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// WhatsApp exports come in two shapes depending on the phone:
//   iPhone:  [12/03/2025, 14:32:10] Aisyah: <attached: 00000012-PHOTO-2025-03-12-14-32-10.jpg>
//   Android: 12/03/2025, 14:32 - Aisyah: IMG-20250312-WA0001.jpg (file attached)
// Dates are read as day/month/year, which is how Malaysian phones write them.
const LINE_IOS = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s[^\]]*\]\s([^:]+):\s(.*)$/;
const LINE_ANDROID = /^‎?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s[^-]+-\s([^:]+):\s(.*)$/;

function parseChat(text: string): Map<string, { sender: string; month: string }> {
  const map = new Map<string, { sender: string; month: string }>();
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(LINE_IOS) || raw.match(LINE_ANDROID);
    if (!m) continue;
    const [, , mm, yy, sender, body] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    const month = `${year}-${mm.padStart(2, "0")}`;
    const file = body.match(/([^\s<>:]+\.(?:jpe?g|png|webp|pdf))/i);
    if (file) map.set(file[1], { sender: sender.trim(), month });
  }
  return map;
}

export default function ImportPage() {
  const { state, update, mode: appMode } = useDocflow();
  const [clientId, setClientId] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [month, setMonth] = useState("all");
  const [log, setLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState("");
  const [extractMode, setExtractMode] = useState<"live" | "demo" | null>(null);

  const months = useMemo(() => Array.from(new Set(found.map((f) => f.month))).sort().reverse(), [found]);
  const chosen = useMemo(() => found.filter((f) => month === "all" || f.month === month), [found, month]);

  if (!state) return <main className="page">Loading...</main>;
  const selected = appMode === "business" ? "me" : clientId || state.clients[0]?.id || "";

  async function readZip(file: File) {
    setLog([]);
    setNote("");
    setFound([]);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const files = unzipSync(buf, { filter: (f) => /\.txt$/i.test(f.name) || MEDIA.test(f.name) });
      const chatKey = Object.keys(files).find((k) => /\.txt$/i.test(k));
      const chat = chatKey ? parseChat(new TextDecoder().decode(files[chatKey])) : new Map();
      const out: Found[] = [];
      for (const [path, data] of Object.entries(files)) {
        if (!MEDIA.test(path)) continue;
        const name = baseName(path);
        const info = chat.get(name);
        out.push({ name, path, data, sender: info?.sender ?? "", month: info?.month ?? "unknown" });
      }
      if (!out.length) {
        setNote("No photos or PDFs found in that file. In WhatsApp, use Export chat and choose Attach media.");
      }
      setFound(out);
      setMonth("all");
    } catch {
      setNote("Could not open that file. Please upload the .zip made by WhatsApp's Export chat with media.");
    }
  }

  async function run() {
    const existing = new Set(state!.bills.filter((b) => b.source === "whatsapp").map((b) => b.fileName));
    const todo = chosen.filter((f) => !existing.has(f.name));
    const skipped = chosen.length - todo.length;
    const batch = todo.slice(0, MAX_FILES);
    setWorking(true);
    setLog(skipped ? [{ text: `Skipped ${skipped} already imported`, ok: true }] : []);
    let done = 0;
    for (const f of batch) {
      try {
        const file = new File([f.data as unknown as BlobPart], f.name, { type: mimeFor(f.name) });
        const { mode: m, bill: e } = await extractFile(file);
        setExtractMode(m);
        const bill: Bill = {
          id: crypto.randomUUID(),
          clientId: selected,
          ...e,
          ...toBillFields(e),
          source: "whatsapp",
          status: "pending",
          fileName: f.name,
          sentBy: f.sender || undefined,
        };
        update((s) => ({
          ...s,
          bills: [bill, ...s.bills],
          clients: s.clients.map((c) => (c.id === selected ? { ...c, docsReceived: c.docsReceived + 1 } : c)),
        }));
        done++;
        setLog((l) => [...l, { text: `${f.name}: read as ${e.supplier || "unknown supplier"}${f.sender ? ` (sent by ${f.sender})` : ""}`, ok: true }]);
      } catch (err) {
        setLog((l) => [...l, { text: `${f.name}: ${err instanceof Error ? err.message : "failed"}`, ok: false }]);
      }
    }
    if (todo.length > MAX_FILES) {
      setLog((l) => [...l, { text: `Imported the first ${MAX_FILES}. Run the import again to continue with the rest.`, ok: true }]);
    }
    setLog((l) => [...l, { text: `Done. ${done} document${done === 1 ? "" : "s"} added to the review queue.`, ok: true }]);
    setWorking(false);
  }

  return (
    <main className="page">
      <h1>Import a WhatsApp chat</h1>
      <p className="sub">
        Bring in every invoice, bill and receipt that is sitting in a WhatsApp chat. Open the chat, tap the name, choose
        Export chat, then Attach media, and upload the .zip here.
      </p>

      {appMode === "firm" && (
        <div className="row">
          <div>
            <label>Client this chat belongs to</label>
            <select value={selected} onChange={(e) => setClientId(e.target.value)}>
              {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="drop">
        <p style={{ margin: "0 0 12px" }}>Choose the exported WhatsApp .zip file</p>
        <label className="btn" style={{ display: "inline-block", color: "#fff", margin: 0 }}>
          Choose .zip
          <input
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && readZip(e.target.files[0])}
          />
        </label>
      </div>

      {extractMode === "demo" && (
        <div className="banner" style={{ marginTop: 16 }}>
          Demo extraction is on, so supplier names and amounts are made-up sample data, not read from your documents.
          Add ANTHROPIC_API_KEY in Vercel (Settings, Environment Variables), then redeploy, to read real documents.
        </div>
      )}

      {note && <div className="banner" style={{ marginTop: 16 }}>{note}</div>}

      {found.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 12px" }}>
            Found <strong>{found.length}</strong> photos and PDFs. Photos that are not documents (people, stickers) are
            read too, so expect a few low confidence items to reject in the review queue.
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <div>
              <label>Month</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">All months ({found.length})</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m === "unknown" ? "Date not found" : m} ({found.filter((f) => f.month === m).length})
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" disabled={working || chosen.length === 0} onClick={run}>
              {working ? "Reading..." : `Read ${Math.min(chosen.length, MAX_FILES)} documents`}
            </button>
          </div>
          {chosen.length > MAX_FILES && (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "10px 0 0" }}>
              Up to {MAX_FILES} documents are read per run. Pick a month, or run it again for the rest.
            </p>
          )}
        </div>
      )}

      <div className="log">
        {log.map((l, i) => <div key={i} className={l.ok ? "" : "err"}>{l.text}</div>)}
        {!working && log.some((l) => l.ok && l.text.startsWith("Done")) && (
          <div style={{ marginTop: 8 }}><a href="/inbox">Go to the review queue</a></div>
        )}
      </div>
    </main>
  );
}
