"use client";

import { useState } from "react";
import { useDocflow, useStaff } from "@/lib/store";
import { useQueryParam } from "@/lib/useQuery";
import { addActivity } from "@/lib/activity";
import { DEMO_MONTH } from "@/lib/config";
import { downloadBytes, openHtml } from "@/lib/download";
import { gatherPdfs } from "@/lib/export/pdfs";
import { monthName, monthOf } from "@/lib/money";
import { approvedMonth, auditPackName, auditPackZip, isApproved, reconciliationHtml } from "@/lib/export/audit";
import { exportBankLines, genericCsv } from "@/lib/export/formats";
import { DRAFT_LABEL, LEDGERS, ledgerInfo, type LedgerId } from "@/lib/export/ledgers";
import { exportLines } from "@/lib/export/lines";
import { DRAFT_PRESETS } from "@/lib/export/presets";
import { safeName } from "@/lib/export/csv";

export default function ExportPage() {
  const { state, update, mode } = useDocflow();
  const staff = useStaff();
  const [qClient, setQClient] = useQueryParam("client");
  const [qMonth, setQMonth] = useQueryParam("month");
  const [qb, setQb] = useState<3 | 4>(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const clientId = state ? (mode === "business" ? "me" : qClient || state.clients[0]?.id || "") : "";
  const month = qMonth || DEMO_MONTH;
  const client = state?.clients.find((c) => c.id === clientId);
  if (!state || !client) return <main className="page">Loading...</main>;

  const approved = isApproved(state, clientId, month);
  const info = ledgerInfo(client.ledger);
  const months = Array.from(new Set([DEMO_MONTH, month, ...state.statements.filter((s) => s.clientId === clientId).map((s) => monthOf(s.periodEnd))])).sort().reverse();
  const snap = approved ? approvedMonth(state, clientId, month) : null;
  const file = snap ? exportBankLines(client.ledger ?? "other", exportLines(snap.snapshot), { clientName: client.name, month, qbLayout: qb }) : null;

  async function pack() {
    setBusy(true);
    setMsg("");
    try {
      const { snapshot } = approvedMonth(state!, clientId, month);
      const pdfs = await gatherPdfs(state!, snapshot.statements.map((s) => s.id));
      const zip = auditPackZip({ state: state!, clientId, month, generatedAt: new Date().toISOString(), pdfs });
      downloadBytes(auditPackName(client!.name, month), zip, "application/zip");
      const held = Object.keys(pdfs).length;
      setMsg(`Audit pack downloaded. ${held} of ${snapshot.statements.length} source ${snapshot.statements.length === 1 ? "PDF" : "PDFs"} included (the rest are not held by the app).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not build the audit pack");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Exports and audit pack</h1>
      <p className="sub">Bank lines in your client&apos;s ledger format, and the audit pack, for an approved month. Everything is built from the approval snapshot, so it matches what was signed off.</p>

      <div className="row">
        {mode === "firm" && (
          <div>
            <label>Client</label>
            <select value={clientId} onChange={(e) => setQClient(e.target.value)}>
              {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label>Month</label>
          <select value={month} onChange={(e) => setQMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
        <div>
          <label>Ledger this client uses</label>
          <select value={client.ledger ?? "xero"} onChange={(e) => update((s) => addActivity({ ...s, clients: s.clients.map((c) => (c.id === clientId ? { ...c, ledger: e.target.value as LedgerId } : c)) }, { clientId, by: staff.name, kind: "ledger", text: `Set the ledger to ${LEDGERS.find((l) => l.id === e.target.value)?.label}` }))}>
            {LEDGERS.map((l) => <option key={l.id} value={l.id}>{l.label}{l.draft ? " (draft template)" : ""}</option>)}
          </select>
        </div>
      </div>

      {msg && <div className="issue info">{msg}</div>}

      {!approved && (
        <div className="issue warn">
          {monthName(month)} is not approved for {client.name}, so nothing can be exported yet. Exports and the audit pack are only available for approved months. <a href={`/month?client=${clientId}&month=${month}`}>Open the month</a>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Bank lines for {info.label}</strong>
        {info.draft && <div className="issue warn" style={{ marginTop: 8 }}>{DRAFT_LABEL}. This is a placeholder column mapping, not {info.label}&apos;s real import template. See docs/DEMO.md for what is needed to finalise it.</div>}
        {client.ledger === "quickbooks" && (
          <div style={{ margin: "10px 0" }}>
            <label>QuickBooks layout</label>
            <select style={{ width: "auto" }} value={qb} onChange={(e) => setQb(Number(e.target.value) as 3 | 4)}>
              <option value={3}>3 columns: Date, Description, Amount</option>
              <option value={4}>4 columns: Date, Description, Credit, Debit</option>
            </select>
          </div>
        )}
        {info.draft && (
          <p className="bill-meta" style={{ margin: "8px 0 0" }}>Columns in this draft: {DRAFT_PRESETS.find((p) => p.id === client.ledger)?.columns.map((c) => c.header).join(", ")}</p>
        )}
        <div className="actions" style={{ justifyContent: "flex-start", marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn" disabled={!file} onClick={() => file && downloadBytes(file.fileName, file.csv, "text/csv;charset=utf-8")}>
            {file ? `Download ${file.label}` : `Download ${info.label} CSV`}{info.draft ? " (draft)" : ""}
          </button>
          <button className="btn secondary" disabled={!snap} onClick={() => snap && downloadBytes(`${safeName(client.name)}-${month}-all-fields.csv`, genericCsv(exportLines(snap.snapshot)), "text/csv;charset=utf-8")}>
            Download CSV with every field
          </button>
        </div>
        {file && <p className="bill-meta" style={{ margin: "8px 0 0" }}>{file.note} File: {file.fileName}</p>}
        <p className="bill-meta" style={{ margin: "8px 0 0" }}>Xero draft bill posting is separate and unchanged: it still happens from the Review queue.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Audit pack</strong>
        <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
          One ZIP: the printable reconciliation statement, the line by line list with the rule or person behind each match, client questions and answers, the sign-off record, the activity log, the ledger CSV, and the source statement PDFs where this browser still holds them.
        </div>
        <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="btn green" disabled={!approved || busy} onClick={pack}>{busy ? "Building..." : "Download audit pack (ZIP)"}</button>
          <button className="btn secondary" disabled={!approved} onClick={() => openHtml(reconciliationHtml({ state, clientId, month, generatedAt: new Date().toISOString() }))}>Preview the reconciliation statement</button>
        </div>
      </div>
      <p className="bill-meta">Need a whole financial year? <a href={`/year-end?client=${clientId}`}>Open year-end mode</a>.</p>
    </main>
  );
}
