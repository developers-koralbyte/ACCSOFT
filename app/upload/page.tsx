"use client";

import { useState } from "react";
import { useDocflow } from "@/lib/store";
import { toBillFields } from "@/lib/malaysia";
import { extractFile } from "@/lib/client";
import type { Bill } from "@/lib/types";

export default function UploadPage() {
  const { state, update, mode: appMode } = useDocflow();
  const [clientId, setClientId] = useState("");
  const [over, setOver] = useState(false);
  const [log, setLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<"live" | "demo" | null>(null);

  if (!state) return <main className="page">Loading...</main>;
  const selected = clientId || state.clients[0]?.id || "";

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setWorking(true);
    setLog([]);
    for (const file of list) {
      try {
        const { mode: extractMode, bill: e } = await extractFile(file);
        setMode(extractMode);
        const bill: Bill = {
          id: crypto.randomUUID(),
          clientId: selected,
          ...e,
          ...toBillFields(e),
          source: "upload",
          status: "pending",
          fileName: file.name,
        };
        update((s) => ({
          ...s,
          bills: [bill, ...s.bills],
          clients: s.clients.map((c) => (c.id === selected ? { ...c, docsReceived: c.docsReceived + 1 } : c)),
        }));
        setLog((l) => [...l, { text: `${file.name}: read as ${e.supplier || "unknown supplier"}, sent to the review queue`, ok: true }]);
      } catch (err) {
        setLog((l) => [...l, { text: `${file.name}: ${err instanceof Error ? err.message : "failed"}`, ok: false }]);
      }
    }
    setWorking(false);
  }

  return (
    <main className="page">
      <h1>Add documents</h1>
      <p className="sub">
        {appMode === "business"
          ? "Drop receipts, bills and invoices here, or import a whole WhatsApp chat in one go. Nothing gets lost in the chat again."
          : "Drop receipts and invoices here. In real use, clients send these on WhatsApp and they land in the same queue."}
      </p>

      {mode === "demo" && (
        <div className="banner">
          Demo extraction is on, so figures are sample data. Add ANTHROPIC_API_KEY to .env.local to read real documents.
        </div>
      )}

      {appMode === "firm" && (
        <div className="row">
          <div>
            <label>Client these documents belong to</label>
            <select value={selected} onChange={(e) => setClientId(e.target.value)}>
              {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      >
        <p style={{ margin: "0 0 12px" }}>{working ? "Reading documents..." : "Drag receipts and invoices here (PDF, JPG, PNG)"}</p>
        <label className="btn" style={{ display: "inline-block", color: "#fff", margin: 0 }}>
          Choose files
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handle(e.target.files)}
          />
        </label>
      </div>

      <div className="log">
        {log.map((l, i) => <div key={i} className={l.ok ? "" : "err"}>{l.text}</div>)}
        {log.some((l) => l.ok) && <div style={{ marginTop: 8 }}><a href="/inbox">Go to the review queue</a></div>}
      </div>
    </main>
  );
}
