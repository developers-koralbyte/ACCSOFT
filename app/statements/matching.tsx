"use client";

import { useMemo, useState } from "react";
import { fmtDate, fmtRM } from "@/lib/money";
import { codesOn, isValidOn, labelFor } from "@/lib/tax";
import { ALL_CATEGORIES } from "@/lib/match/categories";
import { acceptSuggestion, linkDocument, markBankOnly, planAnswer, recordAnswer, rejectSuggestion, undoDecision, type AnswerPlan } from "@/lib/match/actions";
import { buildModelRequest, validateModelSuggestions } from "@/lib/match/model";
import type { LineDecision, LineResult, LineState, PayeeMemory, Reconciliation } from "@/lib/match/types";
import type { AppState, Bill } from "@/lib/types";
import type { Statement } from "@/lib/statements/types";

const STATE_LABEL: Record<LineState, string> = {
  matched: "Matched",
  suggested: "Suggested",
  "bank-only": "Bank only",
  unexplained: "Unexplained",
};

interface Props {
  stmt: Statement;
  clientId: string;
  bills: Bill[];
  recon: Reconciliation;
  decisions: Record<string, LineDecision>;
  memory: PayeeMemory;
  live: boolean;
  update: (fn: (s: AppState) => AppState) => void;
}

interface Prompt {
  r: LineResult;
  plan: AnswerPlan;
  decisions: Record<string, LineDecision>;
}

export default function Matching({ stmt, clientId, bills, recon, decisions, memory, live, update }: Props) {
  const summary = recon.summaries.get(stmt.id);
  const [draft, setDraft] = useState<Record<string, { category: string; tax: string }>>({});
  const [link, setLink] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const freeBills = useMemo(() => bills.filter((b) => !recon.consumed.has(b.id)), [bills, recon]);

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

  function payeeName(r: LineResult): string {
    const b = r.billIds[0] ? billById.get(r.billIds[0]) : undefined;
    if (b) return b.supplier;
    return r.memoryKey ? r.memoryKey.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "this payee";
  }

  function commit(r: LineResult, kind: "confirm" | "accept" | "bank-only", category: string, tax: string) {
    let dec = decisions;
    if (kind === "accept") dec = acceptSuggestion(dec, r, category, tax);
    if (kind === "bank-only") dec = markBankOnly(dec, r.key, category, tax);
    const plan = planAnswer(recon.results.values(), dec, r, category, tax, payeeName(r));
    if (plan.others.length > 0) {
      setPrompt({ r, plan, decisions: dec });
      return;
    }
    const out = recordAnswer({ decisions: dec, memory, clientId, target: r, plan, applyToOthers: false });
    update((s) => ({ ...s, decisions: out.decisions, memory: out.memory }));
    setDraft((d) => {
      const n = { ...d };
      delete n[r.key];
      return n;
    });
  }

  function resolvePrompt(applyToOthers: boolean) {
    if (!prompt) return;
    const out = recordAnswer({ decisions: prompt.decisions, memory, clientId, target: prompt.r, plan: prompt.plan, applyToOthers });
    update((s) => ({ ...s, decisions: out.decisions, memory: out.memory }));
    setDraft((d) => {
      const n = { ...d };
      delete n[prompt.r.key];
      return n;
    });
    setPrompt(null);
  }

  async function askModel() {
    setBusy(true);
    setNote("");
    try {
      const unresolved = rows.filter((r) => r.state === "unexplained" && stmt.lines.find((l) => l.id === r.lineId)!.debit > 0);
      const lines = unresolved.map((r) => {
        const l = stmt.lines.find((x) => x.id === r.lineId)!;
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
          <span className="tag warn">Not reconciled: {summary.outstanding.join(", ")}</span>
        )}
      </div>

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
        {summary.bankOnlyToConfirm > 0 && <span className="tag warn">{summary.bankOnlyToConfirm} bank only {summary.bankOnlyToConfirm === 1 ? "line" : "lines"} to confirm</span>}
      </div>

      {live ? (
        <p style={{ margin: "0 0 10px" }}>
          <button className="btn secondary" disabled={busy || c.unexplained === 0} onClick={askModel}>{busy ? "Asking..." : "Ask the model about unexplained payments"}</button>{" "}
          <span className="bill-meta">Covers one payment for several invoices and invoices paid in parts. Suggestions are never applied automatically.</span>
        </p>
      ) : (
        <p className="bill-meta" style={{ margin: "0 0 10px" }}>
          Model suggestions (one payment covering several invoices, an invoice paid in parts) need an API key and are off in this demo. The rules above run without one.
        </p>
      )}
      {note && <div className="issue info">{note}</div>}

      {prompt && (
        <div className="pw" style={{ marginBottom: 12 }}>
          <strong>
            Apply {prompt.plan.category} with {labelFor(prompt.plan.taxCode)} to {prompt.plan.others.length} other {prompt.plan.others.length === 1 ? "line" : "lines"} for {prompt.plan.payee}?
          </strong>
          <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
            Past lines are changed now and the answer is remembered for this client&apos;s future lines. Lines you already answered are left alone. {prompt.plan.others.length} {prompt.plan.others.length === 1 ? "line" : "lines"} will change.
          </div>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn" onClick={() => resolvePrompt(true)}>Apply to {prompt.plan.others.length} and remember</button>
            <button className="btn secondary" onClick={() => resolvePrompt(false)}>Only this line</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="lines">
          <thead>
            <tr><th>#</th><th>Date</th><th>Description</th><th className="num">Amount</th><th>State</th><th>Category</th><th>Tax code</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = stmt.lines.find((x) => x.id === r.lineId)!;
              const d = cur(r);
              const matchedBills = r.billIds.map((id) => billById.get(id)).filter((b): b is Bill => Boolean(b));
              const taxOptions = codesOn(l.date);
              const hasDecision = Boolean(decisions[r.key]?.billIds?.length || decisions[r.key]?.bankOnly);
              return (
                <tr key={r.key} id={`m-${r.key}`}>
                  <td>{r.lineNo}</td>
                  <td>{fmtDate(l.date)}</td>
                  <td className="desc">
                    {l.description}
                    {matchedBills.length > 0 && (
                      <div className="bill-meta">
                        {r.state === "suggested" ? "Suggested: " : "Matched to "}
                        {matchedBills.map((b) => `${b.supplier}${b.invoiceNo ? ` ${b.invoiceNo}` : ""}`).join(" + ")}
                      </div>
                    )}
                    <div className="bill-meta">{r.ruleLabel}</div>
                    {r.state !== "matched" && <div className="bill-meta">{r.reason}</div>}
                    {r.learned && <div className="bill-meta" style={{ color: "var(--ok)" }}>Learned from your earlier answer</div>}
                    {r.taxWarning && <div className="bill-meta" style={{ color: "var(--warn)" }}>{r.taxWarning}</div>}
                  </td>
                  <td className="num" style={{ color: l.credit ? "var(--ok)" : undefined }}>{l.credit ? `+${fmtRM(l.credit)}` : `-${fmtRM(l.debit)}`}</td>
                  <td>
                    <span className={`tag ${r.state === "matched" ? "ok" : r.state === "suggested" ? "warn" : ""}`} style={r.state === "unexplained" ? { background: "#fee2e2", color: "var(--bad)" } : undefined}>
                      {STATE_LABEL[r.state]}
                    </span>
                    {r.state === "bank-only" && !r.categoryConfirmed && <div className="bill-meta">To confirm</div>}
                    {r.categoryConfirmed && r.state !== "unexplained" && <div className="bill-meta">Confirmed</div>}
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <select aria-label="Category" value={d.category} onChange={(e) => setDraft({ ...draft, [r.key]: { ...d, category: e.target.value } })}>
                      {(ALL_CATEGORIES.includes(d.category) ? ALL_CATEGORIES : [d.category, ...ALL_CATEGORIES]).map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <select aria-label="Tax code" value={d.tax} onChange={(e) => setDraft({ ...draft, [r.key]: { ...d, tax: e.target.value } })}>
                      {!isValidOn(d.tax, l.date) && <option value={d.tax}>{labelFor(d.tax)} (not valid on this date)</option>}
                      {taxOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="num" style={{ whiteSpace: "normal", minWidth: 130 }}>
                    {r.state === "suggested" && (
                      <>
                        <button className="btn" style={{ padding: "4px 10px" }} onClick={() => commit(r, "accept", d.category, d.tax)}>Accept</button>{" "}
                        <button className="linkbtn" onClick={() => update((s) => ({ ...s, decisions: rejectSuggestion(s.decisions, r) }))}>Reject</button>
                      </>
                    )}
                    {r.state === "bank-only" && (!r.categoryConfirmed || dirty(r)) && (
                      <button className="btn" style={{ padding: "4px 10px" }} onClick={() => commit(r, "bank-only", d.category, d.tax)}>{r.categoryConfirmed ? "Save" : "Confirm"}</button>
                    )}
                    {r.state === "matched" && (dirty(r) || !r.categoryConfirmed) && (
                      <button className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => commit(r, "confirm", d.category, d.tax)}>{dirty(r) ? "Save" : "Confirm"}</button>
                    )}
                    {r.state === "unexplained" && l.debit > 0 && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <select aria-label="Link a document" value={link[r.key] ?? ""} onChange={(e) => setLink({ ...link, [r.key]: e.target.value })}>
                          <option value="">Link a document...</option>
                          {freeBills.map((b) => <option key={b.id} value={b.id}>{b.supplier} {fmtRM(Math.round(b.total * 100))}</option>)}
                        </select>
                        <div>
                          <button className="linkbtn" disabled={!link[r.key]} onClick={() => { const b = billById.get(link[r.key]); if (b) update((s) => ({ ...s, decisions: linkDocument(s.decisions, r.key, b.id, b.account, b.taxCode) })); }}>Link</button>{" "}
                          <button className="linkbtn" onClick={() => commit(r, "bank-only", d.category, d.tax)}>Mark bank only</button>
                        </div>
                      </div>
                    )}
                    {r.state === "unexplained" && l.credit > 0 && (
                      <button className="linkbtn" onClick={() => commit(r, "bank-only", d.category, d.tax)}>Mark bank only</button>
                    )}
                    {hasDecision && (
                      <div><button className="linkbtn" onClick={() => update((s) => ({ ...s, decisions: undoDecision(s.decisions, r.key) }))}>Undo</button></div>
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
