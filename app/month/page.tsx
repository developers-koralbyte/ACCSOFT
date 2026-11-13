"use client";

import { useMemo, useState } from "react";
import { useDocflow, useStaff } from "@/lib/store";
import { useQueryParam } from "@/lib/useQuery";
import { addActivity, activityFor } from "@/lib/activity";
import { DEMO_MONTH } from "@/lib/config";
import { fmtDateTime, monthName } from "@/lib/money";
import { kindLabel } from "@/lib/chase/templates";
import { getMonth, updateMonth } from "@/lib/month/records";
import { acknowledgeTotalsOnly, approvalBlockers, approvalStatus, approveMonth, prepareMonth, readiness, reopenMonth } from "@/lib/month/signoff";
import { STAFF } from "@/lib/staff";
import type { AppState } from "@/lib/types";
import { SnapshotView } from "../snapshot-view";
import { chaseClient } from "../chase-action";

export default function MonthPage() {
  const { state, update, mode } = useDocflow();
  const staff = useStaff();
  const [qClient, setQClient] = useQueryParam("client");
  const [qMonth, setQMonth] = useQueryParam("month");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  const single = mode === "business";
  const clientId = state ? (single ? "me" : qClient || state.clients[0]?.id || "") : "";
  const month = qMonth || DEMO_MONTH;
  const client = state?.clients.find((c) => c.id === clientId);
  const ready = useMemo(() => (state && client ? readiness(state, clientId, month) : null), [state, client, clientId, month]);

  if (!state || !client || !ready) return <main className="page">Loading...</main>;

  const rec = getMonth(state, clientId, month);
  const status = approvalStatus(rec);
  const blockers = approvalBlockers(state, clientId, month, staff, ack, single);
  const prepareBlockers = status === "open" ? ready.missing : [];
  const log = activityFor(state, clientId);
  const months = Array.from(new Set([DEMO_MONTH, month])).sort().reverse();
  const other = STAFF.find((p) => p.id !== staff.id);

  const run = (fn: (s: AppState) => { ok: boolean; state?: AppState; reasons?: string[] }) => {
    update((s) => {
      const out = fn(s);
      return out.ok && out.state ? out.state : s;
    });
  };

  return (
    <main className="page">
      <div className="section-head" style={{ margin: "0 0 4px" }}>
        <h1 style={{ margin: 0 }}>{client.name}: {monthName(month)}</h1>
        <div className="row" style={{ margin: 0 }}>
          {!single && (
            <div style={{ minWidth: 200 }}>
              <select aria-label="Client" value={clientId} onChange={(e) => setQClient(e.target.value)}>
                {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ minWidth: 150 }}>
            <select aria-label="Month" value={month} onChange={(e) => setQMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </div>
        </div>
      </div>
      <p className="sub">
        {status === "approved" ? `Approved and locked. Reviewed by ${rec.reviewed?.name}, ${fmtDateTime(rec.reviewed!.at)}.` : "Check the list, then prepare and approve the month. Approval locks it."}
      </p>
      {msg && <div className="issue info">{msg}</div>}

      {status === "approved" && rec.snapshot ? (
        <>
          <div className="issue good">
            Approved by {rec.reviewed?.name} on {fmtDateTime(rec.reviewed!.at)}. Prepared by {rec.prepared?.name} on {fmtDateTime(rec.prepared!.at)}.
            {rec.outstandingAcknowledged ? ` Approved with ${rec.outstandingAcknowledged} ${rec.outstandingAcknowledged === 1 ? "document" : "documents"} outstanding.` : ""}
          </div>
          <div className="issue info">
            This is the snapshot stored on approval. Bills edited or added later do not change it, and the documents it used are locked. Reopen the month to change anything.
          </div>
          <SnapshotView snapshot={rec.snapshot} />
          <div className="card" style={{ marginBottom: 20 }}>
            <strong>Reopen this month</strong>
            <div className="bill-meta" style={{ margin: "2px 0 10px" }}>Reopening removes the lock and the stored snapshot. A reason is required and is written to the activity log.</div>
            <label>Reason for reopening</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: client sent the missing rent invoice" />
            <div className="actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button className="btn secondary" disabled={!reason.trim()} onClick={() => { run((s) => reopenMonth(s, clientId, month, staff, reason)); setReason(""); setAck(false); }}>Reopen month</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="section-head" style={{ margin: "0 0 8px" }}><h2 style={{ fontSize: 18 }}>Before approval</h2></div>
          <div className="card" style={{ marginBottom: 18 }}>
            {ready.checks.map((c) => (
              <div className="check" key={c.id}>
                <span className={`mark ${c.ok ? "ok" : "no"}`}>{c.ok ? "Yes" : "No"}</span>
                <div>
                  <strong>{c.text}</strong>
                  {!c.ok && c.missing && <div className="bill-meta" style={{ color: "var(--bad)" }}>{c.missing}</div>}
                  {!c.ok && c.id === "statement" && <div><a href={`/statements?client=${clientId}`}>Add the statement</a></div>}
                  {!c.ok && (c.id === "proven" || c.id === "reconciled") && <div><a href={`/statements?client=${clientId}`}>Open the statements</a></div>}
                  {!c.ok && c.id === "questions" && <div><a href={`/questions?client=${clientId}&month=${month}`}>Open the questions</a></div>}
                </div>
              </div>
            ))}
            {ready.totalsOnlyPending.map((s) => (
              <div className="check" key={s.id}>
                <span className="mark no">No</span>
                <div>
                  <strong>{s.fileName} is proven on totals only</strong>
                  <div className="bill-meta">It prints no running balance, so single lines could not be proven.</div>
                  <button className="linkbtn" onClick={() => update((st) => acknowledgeTotalsOnly(st, clientId, month, s.id, staff))}>I acknowledge this warning</button>
                </div>
              </div>
            ))}
            <div className="check">
              <span className={`mark ${ready.outstandingDocs.length === 0 ? "ok" : "no"}`}>{ready.outstandingDocs.length === 0 ? "Yes" : "Info"}</span>
              <div>
                <strong>Documents the client usually sends have arrived</strong>
                {ready.outstandingDocs.length > 0 && (
                  <>
                    <div className="bill-meta">
                      Outstanding: {ready.outstandingDocs.map((d) => kindLabel("en", d.kind)).join(", ")}. This does not block approval, but you must acknowledge it below.
                    </div>
                    <div>
                      {ready.outstandingDocs.map((d) => (
                        <button key={d.kind} className="linkbtn" style={{ marginRight: 12 }} onClick={() => update((s) => addActivity(updateMonth(s, clientId, month, (r) => ({ ...r, waived: [...r.waived, d.kind] })), { clientId, month, by: staff.name, kind: "waived", text: `Marked "${d.kind}" as not needed for ${monthName(month)}` }))}>
                          {d.kind}: not needed this month
                        </button>
                      ))}
                      {!single && <button className="linkbtn" onClick={() => { const r = chaseClient(update, state, clientId, month, staff.name); setMsg(r.ok ? "WhatsApp opened with the chase message ready." : "Your browser blocked the WhatsApp window."); }}>Chase on WhatsApp</button>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="section-head" style={{ margin: "0 0 8px" }}><h2 style={{ fontSize: 18 }}>Sign-off</h2></div>
          <div className="steps" style={{ marginBottom: 20 }}>
            {!single && (
              <div className={`step ${rec.prepared ? "done" : ""}`}>
                <strong>Step 1: Prepared by</strong>
                {rec.prepared ? (
                  <div>{rec.prepared.name}<div className="bill-meta">{fmtDateTime(rec.prepared.at)}</div></div>
                ) : (
                  <>
                    <div className="bill-meta" style={{ margin: "2px 0 10px" }}>Needs the statements proven, every line reconciled and no open questions.</div>
                    <button className="btn" disabled={prepareBlockers.length > 0} onClick={() => run((s) => prepareMonth(s, clientId, month, staff))}>Mark as prepared by {staff.name}</button>
                    {prepareBlockers.length > 0 && (
                      <ul className="blockers">{prepareBlockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="step">
              <strong>{single ? "Mark the month done" : "Step 2: Reviewed by"}</strong>
              <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
                {single ? "One step for your own books." : `Must be a different person from Prepared by.${other ? ` Switch to ${other.name} in the top bar to review.` : ""}`}
              </div>
              {ready.outstandingDocs.length > 0 && (
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "0 0 10px", fontWeight: 500, color: "var(--ink)" }}>
                  <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>I acknowledge that {ready.outstandingDocs.length} {ready.outstandingDocs.length === 1 ? "document is" : "documents are"} still outstanding and approve {monthName(month)} anyway.</span>
                </label>
              )}
              <button className="btn green" disabled={blockers.length > 0} onClick={() => { run((s) => approveMonth(s, clientId, month, staff, { ackOutstanding: ack, singleStep: single })); setAck(false); }}>
                {single ? "Mark month done" : `Approve as ${staff.name}`}
              </button>
              {blockers.length > 0 && (
                <>
                  <div className="bill-meta" style={{ marginTop: 8 }}>The button is off because:</div>
                  <ul className="blockers">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <div className="section-head" style={{ margin: "0 0 8px" }}><h2 style={{ fontSize: 18 }}>Activity log</h2></div>
      <div className="card" style={{ padding: 0 }}>
        {log.length === 0 ? (
          <div className="empty">Nothing yet. Every correction, acceptance, confirmation, question, answer, approval and reopening is recorded here.</div>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Month</th><th>What</th></tr></thead>
            <tbody>
              {log.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.at)}</td>
                  <td>{a.by}</td>
                  <td>{a.month ? monthName(a.month) : ""}</td>
                  <td>{a.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
