"use client";

import { useMemo, useState } from "react";
import { fmtDate, fmtRM } from "@/lib/money";
import { labelFor, taxOptionsFor } from "@/lib/tax";
import { ALL_CATEGORIES } from "@/lib/match/categories";
import { linkDocument, markBankOnly, rejectSuggestion, undoDecision } from "@/lib/match/actions";
import { buildModelRequest, validateModelSuggestions } from "@/lib/match/model";
import type { LineDecision, LineResult, LineState, PayeeMemory, Reconciliation } from "@/lib/match/types";
import type { AppState, Bill } from "@/lib/types";
import type { Statement } from "@/lib/statements/types";
import { useAnswerFlow, type Act } from "../answer-flow";
import { SnapshotStatementView } from "../snapshot-view";
import type { SnapBill, SnapStatement } from "@/lib/month/types";

const STATE_LABEL: Record<LineState, string> = {
  matched: "Matched",
  suggested: "Suggested",
  "bank-only": "Bank only",
  unexplained: "Unexplained",
  answered: "Answered",
};

export interface MatchingProps {
  clientId: string;
  month: string;
  bills: Bill[];
  recon: Reconciliation;
  decisions: Record<string, LineDecision>;
  memory: PayeeMemory;
  live: boolean;
  by: string;
  locked: boolean;
  snapshot?: SnapStatement; // stored on approval, shown instead of live results for a locked month
  snapBills?: SnapBill[];
  update: (fn: (s: AppState) => AppState) => void;
  act: Act;
}

export default function Matching({ stmt, clientId, month, bills, recon, decisions, memory, live, by, locked, snapshot, snapBills, update, act }: MatchingProps & { stmt: Statement }) {
  const summary = recon.summaries.get(stmt.id);
  const [draft, setDraft] = useState<Record<string, { category: string; tax: string }>>({});
  const [link, setLink] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const freeBills = useMemo(() => bills.filter((b) => !recon.consumed.has(b.id)), [bills, recon]);

  function payeeName(r: LineResult): string {
    const b = r.billIds[0] ? billById.get(r.billIds[0]) : undefined;
    if (b) return b.supplier;
    return r.memoryKey ? r.memoryKey.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "this payee";
  }

  const flow = useAnswerFlow({
    recon,
    decisions,
    memory,
    clientId,
    by,
    act,
    payeeName,
    onDone: (key) =>
      setDraft((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      }),
  });

  if (locked && snapshot) {
    return (
      <>
        <div className="issue info" style={{ marginTop: 14 }}>This month is approved and locked. This is the result stored on approval, and it does not change when bills are edited later. Reopen the month to change it.</div>
        <SnapshotStatementView snap={snapshot} bills={snapBills ?? []} />
      </>
    );
  }

  if (!summary) return null;

  if (summary.blocked) {
    return (
      <div className="issue warn" style={{ marginTop: 14 }}>
        Matching is switched off for this statement. {summary.blocked === "break" ? "Fix the break above first: a statement with a break cannot be matched, because its figures are not proven." : "Enter the opening and closing balance first."}
      </div>
    );
  }

  const rows = stmt.lines.map((l) => recon.results.get(`${stmt.id}:${l.id}`)).filter((r): r is LineResult => Boolean(r));
  const cur = (r: LineResult) => draft[r.key] ?? { category: r.category, tax: r.taxCode };
  const dirty = (r: LineResult) => cur(r).category !== r.category || cur(r).tax !== r.taxCode;
  const lineOf = (r: LineResult) => stmt.lines.find((x) => x.id === r.lineId)!;
  const labelOf = (r: LineResult) => {
    const l = lineOf(r);
    return `line ${r.lineNo} (${fmtDate(l.date)}, ${fmtRM(l.debit || l.credit)})`;
  };

  async function askModel() {
    setBusy(true);
    setNote("");
    try {
      const unresolved = rows.filter((r) => r.state === "unexplained" && lineOf(r).debit > 0);
      const lines = unresolved.map((r) => {
        const l = lineOf(r);
        return { key: r.key, date: l.date, description: l.description, debit: l.debit };
      });
      if (!lines.length || !freeBills.length) {
        setNote("Nothing left for the model to look at.");
        return;
      }
      const res = await fetch("/api/statements/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildModelRequest(lines, freeBills)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Suggestion request failed");
      const valid = validateModelSuggestions(json.suggestions ?? [], lines, freeBills, recon.consumed);
      update((s) => ({ ...s, modelSuggestions: [...s.modelSuggestions.filter((m) => !lines.some((l) => l.key === m.key)), ...valid] }));
      setNote(valid.length ? `${valid.length} suggestion${valid.length === 1 ? "" : "s"} added. Nothing is applied until you accept it.` : "The model found nothing it was sure about, or its suggestions did not add up exactly and were dropped.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Suggestion request failed");
    } finally {
      setBusy(false);
    }
  }

  const c = summary.counts;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-head" style={{ margin: "0 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Matching to documents</h3>
        {summary.reconciled ? (
          <span className="tag ok">Reconciled</span>
        ) : (
          <span className="tag warn long">Not reconciled: {summary.outstanding.join(", ")}</span>
        )}
      </div>

      {locked && (
        <div className="issue info">This month is approved and locked. Nothing here can be changed unless the month is reopened.</div>
      )}

      {summary.totalsOnly && (
        <div className="issue warn">
          Warning: this statement is proven on totals only. It prints no running balance, so single lines could not be checked. A matched line here is matched on amount, but the line itself is not proven.
        </div>
      )}

      <div className="chips" style={{ marginBottom: 10 }}>
        <span className="tag ok">Matched {c.matched}</span>
        <span className="tag warn">Suggested {c.suggested}</span>
        <span className="tag">Bank only {c["bank-only"]}</span>
        <span className="tag" style={c.unexplained ? { background: "#fee2e2", color: "var(--bad)" } : undefined}>Unexplained {c.unexplained}</span>
        <span className="tag answered">Answered {c.answered}</span>
        {summary.bankOnlyToConfirm > 0 && <span className="tag warn">{summary.bankOnlyToConfirm} bank only {summary.bankOnlyToConfirm === 1 ? "line" : "lines"} to confirm</span>}
        {!locked && summary.bankOnlyToConfirm > 1 && (
          <button
            className="tag warn"
            style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
            title="Confirms every bank only line with the category and tax code shown. One explicit click by you."
            onClick={() => {
              const todo = rows.filter((r) => r.state === "bank-only" && !r.categoryConfirmed);
              act("bank-only", `Confirmed ${todo.length} bank only categories in one step`, (s) => {
                let d = s.decisions;
                for (const r of todo) d = markBankOnly(d, r.key, cur(r).category, cur(r).tax, by);
                return { ...s, decisions: d };
              }, month);
            }}
          >
            Confirm all {summary.bankOnlyToConfirm} proposed categories
          </button>
        )}
        {c.unexplained > 0 && (
          <a className="tag" href={`/questions?client=${clientId}&month=${month}`}>Ask the client about {c.unexplained} unexplained</a>
        )}
      </div>

      {live ? (
        <p style={{ margin: "0 0 10px" }}>
          <button className="btn secondary" disabled={busy || locked || c.unexplained === 0} onClick={askModel}>{busy ? "Asking..." : "Ask the model about unexplained payments"}</button>{" "}
          <span className="bill-meta">Covers one payment for several invoices and invoices paid in parts. Suggestions are never applied automatically.</span>
        </p>
      ) : (
        <p className="bill-meta" style={{ margin: "0 0 10px" }}>
          Model suggestions (one payment covering several invoices, an invoice paid in parts) need an API key and are off in this demo. The rules above run without one.
        </p>
      )}
      {note && <div className="issue info">{note}</div>}

      {flow.promptNode}

      <div style={{ overflowX: "auto" }}>
        <table className="lines match">
          <thead>
            <tr><th>#</th><th>Date</th><th className="desc">Description</th><th className="num">Amount</th><th>State</th><th>Category</th><th>Tax code</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = lineOf(r);
              const d = cur(r);
              const matchedBills = r.billIds.map((id) => billById.get(id)).filter((b): b is Bill => Boolean(b));
              const taxOptions = taxOptionsFor(l.date, d.tax, true);
              const hasDecision = Boolean(decisions[r.key]?.billIds?.length || decisions[r.key]?.bankOnly || decisions[r.key]?.answer);
              const stateClass = r.state === "matched" ? (r.accepted ? "accepted" : "ok") : r.state === "suggested" ? "warn" : r.state === "answered" ? "answered" : "";
              return (
                <tr key={r.key} id={`m-${r.key}`}>
                  <td>{r.lineNo}</td>
                  <td>{fmtDate(l.date)}</td>
                  <td className="desc">
                    {l.description}
                    {matchedBills.length > 0 && (
                      <div className="bill-meta">
                        {r.state === "suggested" ? "Suggested: " : r.state === "answered" ? "Document: " : "Matched to "}
                        {matchedBills.map((b) => `${b.supplier}${b.invoiceNo ? ` ${b.invoiceNo}` : ""}`).join(" + ")}
                      </div>
                    )}
                    {r.accepted ? (
                      <>
                        <div className="bill-meta" style={{ color: "#1d4ed8", fontWeight: 600 }}>Accepted by {r.accepted.by} on {fmtDate(r.accepted.at.slice(0, 10))}</div>
                        {r.accepted.origin && <div className="bill-meta">Came from: {r.accepted.origin}</div>}
                      </>
                    ) : (
                      <div className="bill-meta">{r.ruleLabel}</div>
                    )}
                    {r.state === "answered" && r.answer && (
                      <div className="bill-meta" style={{ color: "#1d4ed8" }}>
                        Client answer{r.answer.text ? `: "${r.answer.text}"` : " (document)"}. Recorded by {r.answer.by} on {fmtDate(r.answer.at.slice(0, 10))}.
                      </div>
                    )}
                    {r.state !== "matched" && r.state !== "answered" && <div className="bill-meta">{r.reason}</div>}
                    {r.learned && <div className="bill-meta" style={{ color: "var(--ok)" }}>Learned from your earlier answer</div>}
                    {r.taxWarning && <div className="bill-meta" style={{ color: "var(--warn)" }}>{r.taxWarning}</div>}
                  </td>
                  <td className="num" style={{ color: l.credit ? "var(--ok)" : undefined }}>{l.credit ? `+${fmtRM(l.credit)}` : `-${fmtRM(l.debit)}`}</td>
                  <td>
                    <span className={`tag ${stateClass}`} style={r.state === "unexplained" ? { background: "#fee2e2", color: "var(--bad)" } : undefined}>
                      {STATE_LABEL[r.state]}
                    </span>
                    {r.accepted && <div className="bill-meta">Accepted</div>}
                    {r.state === "bank-only" && !r.categoryConfirmed && <div className="bill-meta">To confirm</div>}
                    {r.categoryConfirmed && r.state !== "unexplained" && !r.accepted && <div className="bill-meta">Confirmed</div>}
                  </td>
                  <td style={{ minWidth: 0 }}>
                    <select aria-label="Category" disabled={locked} value={d.category} onChange={(e) => setDraft({ ...draft, [r.key]: { ...d, category: e.target.value } })}>
                      {(ALL_CATEGORIES.includes(d.category) ? ALL_CATEGORIES : [d.category, ...ALL_CATEGORIES]).map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ minWidth: 0 }}>
                    <select aria-label="Tax code" title={labelFor(d.tax)} disabled={locked} value={d.tax} onChange={(e) => setDraft({ ...draft, [r.key]: { ...d, tax: e.target.value } })}>
                      {taxOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="num" style={{ whiteSpace: "normal" }}>
                    {!locked && r.state === "suggested" && (
                      <>
                        <button className="btn" style={{ padding: "4px 10px" }} onClick={() => flow.commit(r, "accept", d.category, d.tax, { label: labelOf(r), month })}>Accept</button>{" "}
                        <button className="linkbtn" onClick={() => act("rejected", `Rejected the suggestion on ${labelOf(r)}`, (s) => ({ ...s, decisions: rejectSuggestion(s.decisions, r) }), month)}>Reject</button>
                      </>
                    )}
                    {!locked && r.state === "bank-only" && (!r.categoryConfirmed || dirty(r)) && (
                      <button className="btn" style={{ padding: "4px 10px" }} onClick={() => flow.commit(r, "bank-only", d.category, d.tax, { label: labelOf(r), month })}>{r.categoryConfirmed ? "Save" : "Confirm"}</button>
                    )}
                    {!locked && (r.state === "matched" || r.state === "answered") && (dirty(r) || !r.categoryConfirmed) && (
                      <button className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => flow.commit(r, "confirm", d.category, d.tax, { label: labelOf(r), month })}>{dirty(r) ? "Save" : "Confirm"}</button>
                    )}
                    {!locked && r.state === "unexplained" && l.debit > 0 && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <select aria-label="Link a document" value={link[r.key] ?? ""} onChange={(e) => setLink({ ...link, [r.key]: e.target.value })}>
                          <option value="">Link bill</option>
                          {freeBills.map((b) => <option key={b.id} value={b.id}>{b.supplier} {fmtRM(Math.round(b.total * 100))}</option>)}
                        </select>
                        <div>
                          <button className="linkbtn" disabled={!link[r.key]} onClick={() => { const b = billById.get(link[r.key]); if (b) act("linked", `Linked ${b.supplier} to ${labelOf(r)}`, (s) => ({ ...s, decisions: linkDocument(s.decisions, r.key, b.id, b.account, b.taxCode, by) }), month); }}>Link</button>{" "}
                          <button className="linkbtn" onClick={() => flow.commit(r, "bank-only", d.category, d.tax, { label: labelOf(r), month })}>Mark bank only</button>{" "}
                          <a href={`/questions?client=${clientId}&month=${month}`}>Ask client</a>
                        </div>
                      </div>
                    )}
                    {!locked && r.state === "unexplained" && l.credit > 0 && (
                      <>
                        <button className="linkbtn" onClick={() => flow.commit(r, "bank-only", d.category, d.tax, { label: labelOf(r), month })}>Mark bank only</button>{" "}
                        <a href={`/questions?client=${clientId}&month=${month}`}>Ask client</a>
                      </>
                    )}
                    {!locked && hasDecision && (
                      <div><button className="linkbtn" onClick={() => act("undo", `Undid the decision on ${labelOf(r)}`, (s) => ({ ...s, decisions: undoDecision(s.decisions, r.key) }), month)}>Undo</button></div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="bill-meta" style={{ marginTop: 8 }}>
        Rules run in order: exact amount with an invoice reference, then exact amount with the payee within 7 days, then exact amount with a single candidate within 3 days. A document is matched once across all of this client&apos;s statements. Categories and tax codes are proposals. SST rates are in lib/tax.ts and still need to be verified before real use.
      </p>
    </div>
  );
}

