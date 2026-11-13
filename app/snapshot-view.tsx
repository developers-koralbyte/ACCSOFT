"use client";

import { fmtDate, fmtDateTime, fmtRM } from "@/lib/money";
import { labelFor } from "@/lib/tax";
import type { MonthSnapshot, SnapBill, SnapStatement } from "@/lib/month/types";
import type { LineState } from "@/lib/match/types";

const LABEL: Record<LineState, string> = { matched: "Matched", suggested: "Suggested", "bank-only": "Bank only", unexplained: "Unexplained", answered: "Answered" };

// Read only view of what was stored when the month was approved.
export function SnapshotStatementView({ snap, bills }: { snap: SnapStatement; bills: SnapBill[] }) {
  const byId = new Map(bills.map((b) => [b.id, b]));
  const c = snap.counts;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-head" style={{ margin: "0 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Matching, as stored on approval</h3>
        <span className={`tag ${snap.reconciled ? "ok" : "warn"}`}>{snap.reconciled ? "Reconciled" : "Not reconciled"}</span>
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        <span className="tag ok">Matched {c.matched}</span>
        <span className="tag warn">Suggested {c.suggested}</span>
        <span className="tag">Bank only {c["bank-only"]}</span>
        <span className="tag">Unexplained {c.unexplained}</span>
        <span className="tag answered">Answered {c.answered}</span>
        <span className="tag">{snap.proofLabel}{snap.totalsOnlyAcknowledged ? " (warning acknowledged)" : ""}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="lines">
          <thead><tr><th>#</th><th>Date</th><th>Description</th><th className="num">Amount</th><th>State</th><th>Category</th><th>Tax code</th></tr></thead>
          <tbody>
            {snap.lines.map((l) => (
              <tr key={l.lineId}>
                <td>{l.lineNo}</td>
                <td>{fmtDate(l.date)}</td>
                <td className="desc">
                  {l.description}
                  {l.billIds.map((id) => byId.get(id)).filter(Boolean).map((b) => (
                    <div key={b!.id} className="bill-meta">Document: {b!.supplier} {b!.invoiceNo} {fmtRM(b!.total)}</div>
                  ))}
                  {l.accepted ? (
                    <>
                      <div className="bill-meta" style={{ color: "#1d4ed8", fontWeight: 600 }}>Accepted by {l.accepted.by} on {fmtDate(l.accepted.at.slice(0, 10))}</div>
                      <div className="bill-meta">Came from: {l.accepted.origin}</div>
                    </>
                  ) : (
                    <div className="bill-meta">{l.ruleLabel}</div>
                  )}
                  {l.answer && <div className="bill-meta" style={{ color: "#1d4ed8" }}>Client answer{l.answer.text ? `: "${l.answer.text}"` : " (document)"}. Recorded by {l.answer.by}, {fmtDateTime(l.answer.at)}.</div>}
                  {l.questionSentAt && <div className="bill-meta">Question sent {fmtDate(l.questionSentAt.slice(0, 10))}</div>}
                </td>
                <td className="num" style={{ color: l.credit ? "var(--ok)" : undefined }}>{l.credit ? `+${fmtRM(l.credit)}` : `-${fmtRM(l.debit)}`}</td>
                <td><span className={`tag ${l.state === "matched" ? (l.accepted ? "accepted" : "ok") : l.state === "answered" ? "answered" : ""}`}>{LABEL[l.state]}</span></td>
                <td>{l.category}{l.categoryConfirmed && <div className="bill-meta">Confirmed</div>}</td>
                <td>{labelFor(l.taxCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SnapshotView({ snapshot }: { snapshot: MonthSnapshot }) {
  return (
    <>
      {snapshot.statements.map((s) => (
        <div key={s.id} className="card" style={{ marginBottom: 14 }}>
          <strong>{s.bank} account ending {s.accountLast4}</strong>
          <div className="bill-meta">{fmtDate(s.periodStart)} to {fmtDate(s.periodEnd)} | {s.fileName} | opening {s.opening === null ? "n/a" : fmtRM(s.opening)}, closing {s.closing === null ? "n/a" : fmtRM(s.closing)}</div>
          <SnapshotStatementView snap={s} bills={snapshot.bills} />
        </div>
      ))}
      {snapshot.outstandingDocs > 0 && <div className="issue warn">Approved with {snapshot.outstandingDocs} {snapshot.outstandingDocs === 1 ? "document" : "documents"} outstanding: {snapshot.missingDocs.join(", ")}.</div>}
    </>
  );
}
