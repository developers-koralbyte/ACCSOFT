"use client";

import { useMemo, useState } from "react";
import { useDocflow, useStaff } from "@/lib/store";
import { useQueryParam } from "@/lib/useQuery";
import { addActivity } from "@/lib/activity";
import { DEMO_MONTH } from "@/lib/config";
import { fmtDate, fmtRM, monthName, monthOf } from "@/lib/money";
import { taxOptionsFor } from "@/lib/tax";
import { ALL_CATEGORIES } from "@/lib/match/categories";
import { reconcileClient } from "@/lib/match/engine";
import { reconcileForClient } from "@/lib/month/snapshot";
import { chaseClient } from "../chase-action";
import { answerWithDocument } from "@/lib/match/actions";
import { buildQuestions, openQuestions, type QuestionView } from "@/lib/chase/questions";
import { chaseKinds, missingDocuments } from "@/lib/chase/missing";
import { buildMissingMessage, buildQuestionMessage, isDraft, kindLabel, LANGS, PACKS, questionSentence } from "@/lib/chase/templates";
import { sendWhatsApp } from "@/lib/chase/send";
import { getMonth, isMonthLocked, updateMonth } from "@/lib/month/records";
import type { Lang } from "@/lib/chase/types";
import { useAnswerFlow, type Act } from "../answer-flow";

const STATUS_TAG: Record<QuestionView["status"], { label: string; cls: string }> = {
  "not-sent": { label: "Not sent", cls: "" },
  sent: { label: "Sent", cls: "warn" },
  answered: { label: "Answered", cls: "answered" },
};

export default function QuestionsPage() {
  const { state, update, mode } = useDocflow();
  const staff = useStaff();
  const [qClient, setQClient] = useQueryParam("client");
  const [qMonth, setQMonth] = useQueryParam("month");
  const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, { text: string; doc: string; category: string; tax: string }>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const clientId = state ? (mode === "business" ? "me" : qClient || state.clients[0]?.id || "") : "";
  const month = qMonth || DEMO_MONTH;
  const client = state?.clients.find((c) => c.id === clientId);
  const lang: Lang = client?.language ?? "en";

  const statements = useMemo(() => (state?.statements ?? []).filter((s) => s.clientId === clientId), [state, clientId]);
  const monthStatements = useMemo(() => statements.filter((s) => monthOf(s.periodEnd) === month), [statements, month]);
  const bills = useMemo(() => (state?.bills ?? []).filter((b) => b.clientId === clientId), [state, clientId]);
  const recon = useMemo(() => (state ? reconcileForClient(state, clientId) : reconcileClient({ statements: [], bills: [], decisions: {}, memory: {} })), [state, clientId]);
  const questions = useMemo(() => buildQuestions({ statements: monthStatements, recon, sent: state?.questions ?? {} }), [monthStatements, recon, state]);

  const act: Act = (kind, text, fn, m) => update((s) => addActivity(fn(s), { clientId, month: m ?? month, by: staff.name, kind, text }));
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const flow = useAnswerFlow({
    recon,
    decisions: state?.decisions ?? {},
    memory: state?.memory ?? {},
    clientId,
    by: staff.name,
    act,
    payeeName: (r) => (r.memoryKey ? r.memoryKey.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "this payee"),
  });

  if (!state || !client) return <main className="page">Loading...</main>;

  const locked = isMonthLocked(state, clientId, month);
  const open = openQuestions(questions);
  const answered = questions.filter((q) => q.status === "answered");
  const included = open.filter((q) => !exclude.has(q.key));
  const message = buildQuestionMessage(lang, client.name, month, included.map((q) => ({ date: q.date, amount: q.amount, side: q.side, payee: q.payee })));
  const missing = missingDocuments(state, clientId, month);
  const missingMessage = buildMissingMessage(lang, client.name, month, chaseKinds(state, clientId, month));
  const freeBills = bills.filter((b) => !recon.consumed.has(b.id));
  const months = Array.from(new Set([DEMO_MONTH, month, ...statements.map((s) => monthOf(s.periodEnd))])).sort().reverse();
  const draftOf = (q: QuestionView) => answers[q.key] ?? { text: "", doc: "", category: q.result.category, tax: q.result.taxCode };

  function sendQuestions() {
    if (!included.length) return;
    const res = sendWhatsApp(client!.phone, message);
    const at = new Date().toISOString();
    update((s) => {
      const sent = { ...s.questions };
      included.forEach((q) => (sent[q.key] = { key: q.key, sentAt: at, sentBy: staff.name }));
      return addActivity({ ...s, questions: sent }, { clientId, month, by: staff.name, kind: "question-sent", text: `Sent ${included.length} ${included.length === 1 ? "question" : "questions"} on WhatsApp in ${PACKS[lang].label}` });
    });
    setMsg(res.ok ? "WhatsApp opened with the message ready. Press send there." : "Your browser blocked the WhatsApp window. Allow pop-ups, or copy the message below.");
  }

  function sendChase() {
    const res = chaseClient(update, state!, clientId, month, staff.name);
    setMsg(res.ok ? "WhatsApp opened with the chase message ready. Press send there." : "Your browser blocked the WhatsApp window. Allow pop-ups, or copy the message below.");
  }

  function record(q: QuestionView) {
    const d = draftOf(q);
    const text = d.text.trim();
    if (!text && !d.doc) return setErr({ ...err, [q.key]: "Add the client's answer, or link a document." });
    setErr({ ...err, [q.key]: "" });
    const label = `line ${q.lineNo} (${fmtDate(q.date)}, ${fmtRM(q.amount)})`;
    if (d.doc) {
      const b = billById.get(d.doc);
      act("answer", `Recorded the client's answer on ${label} with document ${b?.supplier ?? ""}${text ? `: "${text}"` : ""}. Category and tax code come from the document`, (s) => ({ ...s, decisions: answerWithDocument(s.decisions, q.key, d.doc, text || undefined, staff.name) }), q.month);
    } else {
      flow.commit(q.result, "answer", d.category, d.tax, { label, month: q.month, answerText: text });
    }
  }

  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
      setMsg("Copied.");
    } catch {
      setMsg("Could not copy. Select the text and copy it.");
    }
  }

  return (
    <main className="page">
      <h1>Client questions</h1>
      <p className="sub">
        Every unexplained bank line becomes a short question. Open questions go to the client as one WhatsApp message. Record the answer here, as text or by linking a document, and the line moves to Answered.
      </p>

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
          <label>Message language for this client</label>
          <select value={lang} onChange={(e) => update((s) => ({ ...s, clients: s.clients.map((c) => (c.id === clientId ? { ...c, language: e.target.value as Lang } : c)) }))}>
            {LANGS.map((l) => <option key={l} value={l}>{PACKS[l].label}{PACKS[l].draft ? " (draft)" : ""}</option>)}
          </select>
        </div>
      </div>

      {isDraft(lang) && (
        <div className="issue warn">
          Draft translation. This {PACKS[lang].label} wording has not been checked by a native speaker. Read it carefully before you send it to a client.
        </div>
      )}
      {locked && <div className="issue info">{monthName(month)} is approved and locked for this client. Questions are read only.</div>}
      {msg && <div className="issue info">{msg}</div>}
      {flow.promptNode}

      <div className="section-head"><h2 style={{ fontSize: 18 }}>Open questions for {monthName(month)}</h2></div>
      {monthStatements.length === 0 ? (
        <div className="card empty">No statement for {monthName(month)} yet, so there is nothing to ask. <a href={`/statements?client=${clientId}`}>Add a statement</a></div>
      ) : open.length === 0 ? (
        <div className="card empty">No open questions. Every line is explained.</div>
      ) : (
        <>
          {open.map((q) => {
            const d = draftOf(q);
            const tag = STATUS_TAG[q.status];
            return (
              <div className="card bill" key={q.key}>
                <div className="bill-head">
                  <div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
                      <input type="checkbox" style={{ width: "auto" }} disabled={locked} checked={!exclude.has(q.key)} onChange={(e) => setExclude((x) => { const n = new Set(x); if (e.target.checked) n.delete(q.key); else n.add(q.key); return n; })} />
                      Include in the message
                    </label>
                    <h3 style={{ marginTop: 6 }}>{questionSentence(lang, q)}</h3>
                    <div className="bill-meta">Line {q.lineNo} | {q.description}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`tag ${tag.cls}`}>{tag.label}{q.status === "sent" && q.sentAt ? ` ${fmtDate(q.sentAt.slice(0, 10))}` : ""}</span>
                    {q.status === "sent" && q.sentBy && <div className="bill-meta">by {q.sentBy}</div>}
                  </div>
                </div>
                {!locked && (
                  <>
                    <div className="fields">
                      <div style={{ gridColumn: "span 2" }}>
                        <label>Client&apos;s answer (text)</label>
                        <input placeholder="For example: repairs to the delivery van" value={d.text} onChange={(e) => setAnswers({ ...answers, [q.key]: { ...d, text: e.target.value } })} />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <label>Or link a document from the queue</label>
                        <select value={d.doc} onChange={(e) => setAnswers({ ...answers, [q.key]: { ...d, doc: e.target.value } })}>
                          <option value="">No document</option>
                          {freeBills.map((b) => <option key={b.id} value={b.id}>{b.supplier} {b.invoiceNo} {fmtRM(Math.round(b.total * 100))} ({fmtDate(b.date)})</option>)}
                        </select>
                      </div>
                      {!d.doc && (
                        <>
                          <div>
                            <label>Category (you choose, for a text answer)</label>
                            <select value={d.category} onChange={(e) => setAnswers({ ...answers, [q.key]: { ...d, category: e.target.value } })}>
                              {(ALL_CATEGORIES.includes(d.category) ? ALL_CATEGORIES : [d.category, ...ALL_CATEGORIES]).map((a) => <option key={a}>{a}</option>)}
                            </select>
                          </div>
                          <div>
                            <label>Tax code</label>
                            <select value={d.tax} onChange={(e) => setAnswers({ ...answers, [q.key]: { ...d, tax: e.target.value } })}>
                              {taxOptionsFor(q.date, d.tax).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                      {d.doc && <div className="bill-meta" style={{ gridColumn: "span 2" }}>Category and tax code will come from the document, through the normal match.</div>}
                    </div>
                    {err[q.key] && <div className="err">{err[q.key]}</div>}
                    <div className="actions">
                      <button
                        className="btn secondary"
                        title="Fills in a made-up answer so you can see the flow. You still press Record answer."
                        onClick={() => {
                          const rent = /RENT|SEWA/i.test(q.description);
                          setAnswers({ ...answers, [q.key]: { text: rent ? "Shop rent for the month, no invoice" : "Repairs to the delivery van", doc: "", category: rent ? "Rent" : "Repairs and maintenance", tax: q.result.taxCode } });
                        }}
                      >
                        Use example answer
                      </button>
                      <button className="btn" onClick={() => record(q)}>Record answer</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <div className="card">
            <strong>One message for {client.name}</strong>
            <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
              {included.length} of {open.length} open {open.length === 1 ? "question" : "questions"} included, in {PACKS[lang].label}. Opens WhatsApp with this text ready to send.
            </div>
            <pre className="msg">{message || "Select at least one question."}</pre>
            <div className="actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button className="btn" disabled={!included.length || locked || !client.phone} onClick={sendQuestions}>Send on WhatsApp</button>
              <button className="btn secondary" disabled={!message} onClick={() => copy(message)}>Copy message</button>
            </div>
          </div>
        </>
      )}

      {answered.length > 0 && (
        <>
          <div className="section-head"><h2 style={{ fontSize: 18 }}>Answered ({answered.length})</h2></div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Line</th><th>Payment</th><th>Answer</th><th>Category</th><th>Recorded</th></tr></thead>
              <tbody>
                {answered.map((q) => (
                  <tr key={q.key}>
                    <td>{q.lineNo}</td>
                    <td>{fmtDate(q.date)}, {fmtRM(q.amount)}, {q.payee}</td>
                    <td>
                      {q.answer?.text ? `"${q.answer.text}"` : "Document linked"}
                      {q.result.billIds[0] && billById.get(q.result.billIds[0]) && <div className="bill-meta">{billById.get(q.result.billIds[0])!.supplier} {billById.get(q.result.billIds[0])!.invoiceNo}</div>}
                    </td>
                    <td>{q.result.category}<div className="bill-meta">{q.result.taxCode}</div></td>
                    <td>{q.answer ? `${q.answer.by}, ${fmtDate(q.answer.at.slice(0, 10))}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-head" id="missing"><h2 style={{ fontSize: 18 }}>Missing documents for {monthName(month)}</h2></div>
      <div className="card">
        {missing.length === 0 && !chaseKinds(state, clientId, month).length ? (
          <p style={{ margin: 0 }}>Nothing missing. Everything this client normally sends has arrived, or was marked not needed.</p>
        ) : (
          <>
            <p style={{ margin: "0 0 10px" }}>Based on what {client.name} sent in earlier months, these have not arrived for {monthName(month)}:</p>
            <table>
              <thead><tr><th>Document</th><th>Usually sent</th><th /></tr></thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.kind}>
                    <td><strong>{kindLabel("en", m.kind)}</strong></td>
                    <td className="bill-meta">{m.seenIn.map(monthName).join(", ")}</td>
                    <td className="num">
                      <button className="linkbtn" disabled={locked} onClick={() => act("waived", `Marked "${m.kind}" as not needed for ${monthName(month)}`, (s) => updateMonth(s, clientId, month, (r) => ({ ...r, waived: [...r.waived, m.kind] })))}>Not needed this month</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <pre className="msg" style={{ marginTop: 12 }}>{missingMessage}</pre>
            <div className="actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button className="btn" disabled={locked || !client.phone} onClick={sendChase}>Send chase on WhatsApp</button>
              <button className="btn secondary" onClick={() => copy(missingMessage)}>Copy message</button>
            </div>
          </>
        )}
        {getMonth(state, clientId, month).waived.length > 0 && (
          <p className="bill-meta" style={{ margin: "10px 0 0" }}>Marked not needed this month: {getMonth(state, clientId, month).waived.join(", ")}</p>
        )}
      </div>
    </main>
  );
}
