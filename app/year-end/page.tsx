"use client";

import { useMemo, useState } from "react";
import { useDocflow } from "@/lib/store";
import { useQueryParam } from "@/lib/useQuery";
import { DEMO_MONTH } from "@/lib/config";
import { downloadBytes } from "@/lib/download";
import { monthName } from "@/lib/money";
import { fyEndYearOf, fyOptions, fyRange, yearEndPackName, yearEndPackZip, yearEndView } from "@/lib/export/yearend";
import { getMonth } from "@/lib/month/records";
import { gatherPdfs } from "@/lib/export/pdfs";

export default function YearEndPage() {
  const { state, mode } = useDocflow();
  const [qClient, setQClient] = useQueryParam("client");
  const [qYear, setQYear] = useQueryParam("fy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const clientId = state ? (mode === "business" ? "me" : qClient || state.clients[0]?.id || "") : "";
  const client = state?.clients.find((c) => c.id === clientId);
  const fyEnd = client?.fyEndMonth ?? 12;
  const years = useMemo(() => (state ? Array.from(new Set([...fyOptions(state, clientId, DEMO_MONTH)])).sort((a, b) => b - a) : []), [state, clientId]);
  const endYear = qYear ? Number(qYear) : years[0] ?? fyEndYearOf(DEMO_MONTH, fyEnd);
  const fy = fyRange(fyEnd, endYear);
  const view = useMemo(() => (state ? yearEndView(state, clientId, fy, new Date()) : null), [state, clientId, fy.endMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || !client || !view) return <main className="page">Loading...</main>;

  async function download() {
    setBusy(true);
    setMsg("");
    try {
      const ids = view!.approvedMonths.flatMap((m) => getMonth(state!, clientId, m).snapshot?.statements.map((s) => s.id) ?? []);
      const pdfsByStatement = await gatherPdfs(state!, ids);
      const zip = yearEndPackZip({ state: state!, clientId, fy, now: new Date(), generatedAt: new Date().toISOString(), pdfsByStatement });
      downloadBytes(yearEndPackName(client!.name, fy), zip, "application/zip");
      setMsg(`Year-end pack downloaded: ${view!.approvedMonths.length} approved ${view!.approvedMonths.length === 1 ? "month" : "months"}, ${view!.notApproved.length} not yet approved (listed in the summary).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not build the year-end pack");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Year-end mode</h1>
      <p className="sub">One view per client and account for a financial year: months proven, missing, with breaks, reconciled and approved, and one bundle of every approved month&apos;s audit pack.</p>

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
          <label>Financial year</label>
          <select value={endYear} onChange={(e) => setQYear(e.target.value)}>
            {Array.from(new Set([...years, endYear])).sort((a, b) => b - a).map((y) => <option key={y} value={y}>{fyRange(fyEnd, y).label}</option>)}
          </select>
        </div>
      </div>
      <p className="bill-meta" style={{ marginTop: -8 }}>Year end month for this client: {monthName(`2026-${String(fyEnd).padStart(2, "0")}`).split(" ")[0]}. Change it on the Clients page.</p>
      {msg && <div className="issue info">{msg}</div>}

      {view.accounts.length === 0 ? (
        <div className="card empty">No statements for {client.name} in this financial year yet. <a href={`/statements?client=${clientId}`}>Add statements</a> (up to twelve at a time).</div>
      ) : (
        view.accounts.map((a) => (
          <div className="card" key={a.accountKey} style={{ marginBottom: 14 }}>
            <strong>{a.bank}, account ending {a.last4}</strong>
            <div className="proof-sum" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              <div><div className="n" style={{ color: a.provenCount === 12 ? "var(--ok)" : undefined }}>{a.provenCount} of 12</div><div className="l">Months proven</div></div>
              <div><div className="n" style={{ color: a.missing.length ? "var(--bad)" : "var(--ok)" }}>{a.missing.length}</div><div className="l">Months missing</div></div>
              <div><div className="n" style={{ color: a.breakCount ? "var(--bad)" : "var(--ok)" }}>{a.breakCount}</div><div className="l">Breaks found</div></div>
              <div><div className="n">{a.reconciledCount} of 12</div><div className="l">Months reconciled</div></div>
            </div>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="lines">
                <thead><tr><th>Month</th><th>Statement</th><th>Reconciled</th><th>Approved</th></tr></thead>
                <tbody>
                  {a.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthName(m.month)}</td>
                      <td style={{ color: !m.hasStatement && m.due ? "var(--bad)" : undefined }}>{m.proofLabel}{m.breaks ? ` (${m.breaks} ${m.breaks === 1 ? "break" : "breaks"})` : ""}</td>
                      <td>{m.hasStatement ? (m.reconciled ? "Yes" : "No") : ""}</td>
                      <td>{m.approved ? <span className="tag ok">Approved</span> : <span className="tag">Not approved</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div className="card">
        <strong>Year-end pack</strong>
        <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
          One ZIP with a folder of audit pack files for each approved month ({view.approvedMonths.length} now), plus a summary that lists the {view.notApproved.length} {view.notApproved.length === 1 ? "month" : "months"} not yet approved and why.
        </div>
        {view.notApproved.length > 0 && (
          <ul style={{ fontSize: 13, margin: "0 0 10px", paddingLeft: 18 }}>
            {view.notApproved.slice(0, 6).map((n) => <li key={n.month}>{monthName(n.month)}: {n.reason}</li>)}
            {view.notApproved.length > 6 && <li>and {view.notApproved.length - 6} more, all listed in the summary</li>}
          </ul>
        )}
        <button className="btn green" disabled={busy} onClick={download}>{busy ? "Building..." : "Download year-end pack (ZIP)"}</button>
      </div>
    </main>
  );
}
