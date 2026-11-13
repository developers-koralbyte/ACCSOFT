"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDocflow, useStaff } from "@/lib/store";
import { addActivity } from "@/lib/activity";
import { useQueryParam } from "@/lib/useQuery";
import { getMonth, isMonthLocked } from "@/lib/month/records";
import { removeFile, saveFile } from "@/lib/files";
import type { Act } from "../answer-flow";
import { fmtDate, fmtRM, monthName, monthOf, parseSen, senToPlain } from "@/lib/money";
import { proveStatement, correctLine } from "@/lib/statements/proof";
import { checkContinuity } from "@/lib/statements/continuity";
import { ingestPdf, type LivePage } from "@/lib/statements/ingest";
import { loadBrowserPdfjs, PdfPasswordError } from "@/lib/statements/pdf";
import { duplicateMessage, toStatement } from "@/lib/statements/build";
import type { ProofResult, Statement, StatementKind } from "@/lib/statements/types";
import { yearEndSummaries } from "@/lib/statements/yearend";
import { reconcileClient } from "@/lib/match/engine";
import { reconcileForClient } from "@/lib/month/snapshot";
import Matching from "./matching";
import expected from "@/data/sample-expected.json";
import { GUARANTEE as GUARANTEE_TEXT } from "@/lib/copy";
import { SITE } from "@/lib/site-config";

const MAX_BATCH = 12;

const GUARANTEE = GUARANTEE_TEXT;

const SAMPLES = Object.entries(expected).map(([id, e]) => ({
  id,
  file: e.file,
  title: e.title,
  clientId: e.clientId,
  layout: `Bank ${e.layout} layout`,
}));

interface Msg {
  text: string;
  level: "info" | "error" | "good";
}
interface Pending {
  name: string;
  data: Uint8Array;
  clientId: string;
  kind: StatementKind;
  layout?: string;
  reason: "need" | "wrong";
}

function toneOf(p: ProofResult): "ok" | "bad" | "amber" {
  if (p.status === "proven") return "ok";
  if (p.status === "break") return "bad";
  return "amber";
}

export default function StatementsPage() {
  const { state, update, mode } = useDocflow();
  const staff = useStaff();
  const [clientId, setClientId] = useState("");
  const [qClient, setQClient] = useQueryParam("client");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const pdfjsRef = useRef<Awaited<ReturnType<typeof loadBrowserPdfjs>> | null>(null);

  useEffect(() => {
    fetch("/api/statements/page")
      .then((r) => r.json())
      .then((j) => setLive(Boolean(j.live)))
      .catch(() => setLive(false));
  }, []);

  const selected = state ? (mode === "business" ? "me" : clientId || qClient || state.clients[0]?.id || "") : "";
  const mine = useMemo(
    () =>
      (state?.statements ?? [])
        .filter((s) => s.clientId === selected)
        .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1)),
    [state, selected],
  );
  // arriving on the page with statements already loaded: open the latest one so the proof and matching are in view
  useEffect(() => {
    if (open.size === 0 && mine.length > 0) setOpen(new Set([mine[mine.length - 1].id]));
  }, [mine.length, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = useMemo(() => checkContinuity(mine), [mine]);
  const yearEnd = useMemo(() => yearEndSummaries(mine), [mine]);
  const recon = useMemo(() => (state ? reconcileForClient(state, selected) : reconcileClient({ statements: [], bills: [], decisions: {}, memory: {} })), [state, selected]);
  // accounts with two or more statements and nothing wrong between them
  const goodAccounts = useMemo(() => {
    const groups = new Map<string, Statement[]>();
    for (const s of mine) groups.set(s.accountKey, [...(groups.get(s.accountKey) ?? []), s]);
    return Array.from(groups.entries())
      .filter(([, list]) => list.length > 1 && !issues.some((i) => i.level !== "info" && i.statementIds.some((id) => list.some((s) => s.id === id))))
      .map(([key, list]) => ({ key, last4: list[0].accountLast4, count: list.length, from: list[0].periodEnd, to: list[list.length - 1].periodEnd }));
  }, [mine, issues]);

  if (!state) return <main className="page">Loading...</main>;

  const clientName = (id: string) => state.clients.find((c) => c.id === id)?.name ?? "this client";
  const say = (text: string, level: Msg["level"] = "info") => setMsgs((m) => [...m, { text, level }]);

  // One update that changes data and writes the activity log entry for it.
  const act: Act = (kind, text, fn, month) => update((st) => addActivity(fn(st), { clientId: selected, month, by: staff.name, kind, text }));

  async function pdfjs() {
    if (!pdfjsRef.current) pdfjsRef.current = await loadBrowserPdfjs();
    return pdfjsRef.current;
  }

  async function extractPage(image: string): Promise<LivePage> {
    const res = await fetch("/api/statements/page", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const json = await res.json();
    if (!res.ok || !json.page) throw new Error(json.error || "Page extraction failed");
    return json.page as LivePage;
  }

  // One path for uploads, WhatsApp-sourced files and the bundled samples.
  async function ingest(item: { name: string; data: Uint8Array; clientId: string; kind: StatementKind; layout?: string }, pw?: string) {
    setBusy(true);
    try {
      const r = await ingestPdf(item.data, { pdfjs: await pdfjs(), password: pw, liveAvailable: live, extractPage });
      if (r.kind === "needs-live") {
        say(
          `${item.name} looks like a scan or photo with no text layer. Reading scanned statements needs live extraction, which is not switched on in this demo. Try one of the sample statements below instead.`,
          "error",
        );
        return;
      }
      if (r.kind === "unreadable") {
        say(`${item.name}: ${r.reason} The balance proof needs the transaction table, so nothing was added.`, "error");
        return;
      }
      const stmt = toStatement(r.draft, { clientId: item.clientId, fileName: item.name, kind: r.usedLive ? "scan" : item.kind, layout: item.layout });
      const dup = duplicateMessage(state!.statements, stmt);
      if (dup) {
        say(dup, "info");
        return;
      }
      if (isMonthLocked(state!, item.clientId, monthOf(stmt.periodEnd))) {
        say(`${monthName(monthOf(stmt.periodEnd))} is approved and locked for ${clientName(item.clientId)}. Reopen the month to add or replace a statement.`, "error");
        return;
      }
      update((s) =>
        addActivity({ ...s, statements: [...s.statements, stmt] }, {
          clientId: item.clientId,
          month: monthOf(stmt.periodEnd),
          by: staff.name,
          kind: "statement-added",
          text: `Added statement ${stmt.fileName}: account ending ${stmt.accountLast4}, ${stmt.lines.length} lines`,
        }),
      );
      setOpen(new Set([stmt.id])); // focus on the statement just added
      if (item.clientId !== selected) setClientId(item.clientId);
      if (item.kind !== "sample") {
        // keep the original PDF in this browser so the audit pack can include it
        const saved = await saveFile(stmt.id, item.name, item.data);
        if (saved.ok) update((st) => ({ ...st, statements: st.statements.map((x) => (x.id === stmt.id ? { ...x, fileStored: true } : x)) }));
        else say(saved.reason, "info");
      }
      const p = proveStatement(stmt);
      say(
        `${item.name}: read ${stmt.lines.length} lines for ${clientName(item.clientId)}. ${p.label}.`,
        p.status === "break" ? "error" : "good",
      );
      stmt.warnings.forEach((w) => say(w, "info"));
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setPending({ ...item, reason: err.reason });
        setPassword("");
      } else {
        say(`${item.name}: ${err instanceof Error ? err.message : "could not be read"}`, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setMsgs([]);
    const list = Array.from(files);
    if (list.length > MAX_BATCH) say(`Up to ${MAX_BATCH} statements are read at a time (twelve months). The first ${MAX_BATCH} were read. Upload the rest in a second batch.`, "info");
    for (const f of list.slice(0, MAX_BATCH)) {
      if (!/\.pdf$/i.test(f.name)) {
        say(`${f.name} is not a PDF. Bank statements are read from PDF files.`, "error");
        continue;
      }
      await ingest({ name: f.name, data: new Uint8Array(await f.arrayBuffer()), clientId: selected, kind: "pdf-text" });
    }
  }

  async function trySample(id: string) {
    const sample = SAMPLES.find((x) => x.id === id);
    if (!sample) return;
    setMsgs([]);
    const res = await fetch(`/samples/${sample.file}`);
    if (!res.ok) return say("The sample file could not be loaded.", "error");
    await ingest({
      name: sample.file,
      data: new Uint8Array(await res.arrayBuffer()),
      clientId: mode === "business" ? "me" : sample.clientId,
      kind: "sample",
      layout: sample.layout,
    });
  }

  async function unlock() {
    if (!pending) return;
    const p = pending;
    const pw = password;
    setPending(null);
    setPassword(""); // the password is used once, in memory, and is never saved
    await ingest(p, pw);
  }

  async function dropFile(st: Statement) {
    await removeFile(st.id);
    update((s) =>
      addActivity({ ...s, statements: s.statements.map((x) => (x.id === st.id ? { ...x, fileStored: false } : x)) }, { clientId: st.clientId, month: monthOf(st.periodEnd), by: staff.name, kind: "file-removed", text: `Removed the stored PDF of ${st.fileName}. The parsed figures were kept` }),
    );
  }

  function patchStatement(id: string, fn: (s: Statement) => Statement, log?: string) {
    const target = state!.statements.find((x) => x.id === id);
    update((st) => {
      const next = { ...st, statements: st.statements.map((x) => (x.id === id ? fn(x) : x)) };
      return log && target ? addActivity(next, { clientId: target.clientId, month: monthOf(target.periodEnd), by: staff.name, kind: "correction", text: log }) : next;
    });
  }

  return (
    <main className="page wide">
      <h1>Bank statements</h1>
      <p className="sub">
        Upload a bank statement PDF. It is read in your browser, then proven to the cent: opening balance plus money in,
        less money out, must equal the closing balance, and every running balance must agree line by line.
      </p>

      {mode === "firm" && (
        <div className="row">
          <div>
            <label>Client</label>
            <select value={selected} onChange={(e) => { setClientId(e.target.value); setQClient(e.target.value); }}>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="drop">
        <p style={{ margin: "0 0 12px" }}>
          Choose one or more statement PDFs for <strong>{clientName(selected)}</strong>
        </p>
        <label className="btn" style={{ display: "inline-block", color: "#fff", margin: 0 }}>
          {busy ? "Reading..." : "Choose PDF"}
          <input type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} disabled={busy} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <p style={{ fontSize: 13, margin: "14px 0 0" }}>
          Digital statements are read on your device, so there is no upload size limit and nothing is sent to a server. If a PDF is
          password protected you will be asked for the password. It is used in this browser tab only and is never saved. Never share online banking logins: {SITE.name} does not need them.
        </p>
        <p style={{ fontSize: 13, margin: "8px 0 0" }}>
          The PDF files are kept in this browser only, so they can go in the audit pack. Each statement has a Remove file button, and the figures stay.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Try a sample statement</strong>
        <div className="bill-meta" style={{ margin: "2px 0 10px" }}>Fictional statements, generated as real PDFs, so the same upload path runs.</div>
        <div className="chips">
          {SAMPLES.map((s) => (
            <button key={s.id} className="btn secondary" disabled={busy} onClick={() => trySample(s.id)}>{s.title}</button>
          ))}
        </div>
      </div>

      {pending && (
        <div className="pw">
          <strong>{pending.reason === "wrong" ? "That password did not work." : "This PDF is password protected."}</strong>
          <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
            {pending.name}. The password unlocks the file in your browser only. It is not stored or sent anywhere.
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <div>
              <label>PDF password</label>
              <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && password && unlock()} />
            </div>
            <button className="btn" disabled={!password || busy} onClick={unlock}>Unlock</button>
            <button className="btn secondary" onClick={() => { setPending(null); setPassword(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {msgs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {msgs.map((m, i) => (
            <div key={i} className={`issue ${m.level === "error" ? "error" : m.level === "good" ? "good" : "info"}`}>{m.text}</div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2 style={{ fontSize: 18 }}>{clientName(selected)}: statements</h2>
      </div>

      {yearEnd.map((y) => (
        <div key={y.accountKey} className="card" style={{ marginBottom: 14 }}>
          <strong>Year-end summary, account ending {y.last4}</strong>
          <div className="bill-meta">{y.bank}, {monthName(y.from)} to {monthName(y.to)}, {y.statementCount} statements loaded</div>
          <div className="proof-sum" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div><div className="n" style={{ color: y.proven === y.months.length ? "var(--ok)" : undefined }}>{y.proven} of {y.months.length}</div><div className="l">Months proven</div></div>
            <div><div className="n" style={{ color: y.missing.length ? "var(--bad)" : "var(--ok)" }}>{y.missing.length}</div><div className="l">{y.missing.length ? `Months missing: ${y.missing.map(monthName).join(", ")}` : "Months missing"}</div></div>
            <div><div className="n" style={{ color: y.breaks ? "var(--bad)" : "var(--ok)" }}>{y.breaks}</div><div className="l">Breaks found</div></div>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {y.months.map((m) => (
              <span key={m.month} className={`tag ${m.status === "proven" ? "ok" : m.status === "missing" ? "" : "warn"}`} style={m.status === "missing" ? { background: "#fee2e2", color: "var(--bad)" } : undefined} title={m.label}>
                {monthName(m.month)}: {m.status === "proven" ? "proven" : m.status === "missing" ? "missing" : "not proven"}
              </span>
            ))}
          </div>
        </div>
      ))}

      {(goodAccounts.length > 0 || issues.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          {goodAccounts.map((g) => (
            <div key={g.key} className="issue good">
              Continuity, account ending {g.last4}: {g.count} statements run on unbroken from {monthName(monthOf(g.from))} to {monthName(monthOf(g.to))}. Each month opens at exactly the previous month&apos;s closing balance.
            </div>
          ))}
          {issues.map((i, n) => (
            <div key={n} className={`issue ${i.level}`}>{i.message}</div>
          ))}
        </div>
      )}

      {mine.length === 0 ? (
        <div className="card empty">No statements for this client yet. Upload a PDF or try a sample above.</div>
      ) : (
        mine.map((s) => (
          <StatementCard
            key={s.id}
            stmt={s}
            expanded={open.has(s.id)}
            toggle={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
            patch={(fn, log) => patchStatement(s.id, fn, log)}
            locked={isMonthLocked(state, s.clientId, monthOf(s.periodEnd))}
            dropFile={() => dropFile(s)}
            remove={() => {
              void removeFile(s.id);
              update((st) =>
                addActivity(
                  {
                    ...st,
                    statements: st.statements.filter((x) => x.id !== s.id),
                    decisions: Object.fromEntries(Object.entries(st.decisions).filter(([k]) => !k.startsWith(`${s.id}:`))),
                  },
                  { clientId: s.clientId, month: monthOf(s.periodEnd), by: staff.name, kind: "statement-removed", text: `Removed statement ${s.fileName}` },
                ),
              );
            }}
            matching={{
              clientId: selected,
              month: monthOf(s.periodEnd),
              bills: state.bills.filter((b) => b.clientId === selected),
              recon,
              decisions: state.decisions,
              memory: state.memory,
              live,
              by: staff.name,
              locked: isMonthLocked(state, s.clientId, monthOf(s.periodEnd)),
              snapshot: getMonth(state, s.clientId, monthOf(s.periodEnd)).snapshot?.statements.find((x) => x.id === s.id),
              snapBills: getMonth(state, s.clientId, monthOf(s.periodEnd)).snapshot?.bills,
              update,
              act,
            }}
          />
        ))
      )}
      <p className="guarantee">{GUARANTEE}</p>
    </main>
  );
}

function StatementCard({
  stmt,
  expanded,
  toggle,
  patch,
  remove,
  dropFile,
  locked,
  matching,
}: {
  stmt: Statement;
  expanded: boolean;
  toggle: () => void;
  patch: (fn: (s: Statement) => Statement, log?: string) => void;
  remove: () => void;
  dropFile: () => void;
  locked: boolean;
  matching: Omit<React.ComponentProps<typeof Matching>, "stmt">;
}) {
  const proof = useMemo(() => proveStatement(stmt), [stmt]);
  const tone = toneOf(proof);
  const [editing, setEditing] = useState<{ id: string; debit: string; credit: string } | null>(null);
  const [editErr, setEditErr] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");

  function jump(lineId: string) {
    const el = document.getElementById(`ln-${stmt.id}-${lineId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(lineId);
    setTimeout(() => setFlash(null), 1800);
  }

  function saveEdit() {
    if (!editing) return;
    const debit = editing.debit.trim() === "" ? 0 : parseSen(editing.debit);
    const credit = editing.credit.trim() === "" ? 0 : parseSen(editing.credit);
    if (debit === null || credit === null || debit < 0 || credit < 0) return setEditErr("Enter amounts like 1250.00");
    if (debit > 0 && credit > 0) return setEditErr("A line is either money in or money out, not both.");
    const side = credit > 0 ? "credit" : "debit";
    const lineNo = stmt.lines.findIndex((x) => x.id === editing.id) + 1;
    const newAmount = side === "credit" ? credit : debit;
    patch((s) => ({ ...s, lines: correctLine(s.lines, editing.id, side, newAmount) }), `Corrected line ${lineNo} of ${stmt.fileName} to ${side === "credit" ? "money in" : "money out"} ${fmtRM(newAmount)}`);
    setEditing(null);
    setEditErr("");
  }

  function saveBalances() {
    const o = opening.trim() ? parseSen(opening) : stmt.opening;
    const c = closing.trim() ? parseSen(closing) : stmt.closing;
    if (o === null && opening.trim() === "" && stmt.opening === null) return;
    patch((s) => ({ ...s, opening: o ?? s.opening, closing: c ?? s.closing }));
  }

  const breakByLine = new Map(proof.breaks.map((b) => [b.lineId, b]));

  return (
    <div className="card bill">
      <div className="stmt-head" onClick={toggle}>
        <div>
          <h3>
            {stmt.bank} <span className="bill-meta">account ending {stmt.accountLast4}</span>
            {stmt.layout && <span className="tag" style={{ marginLeft: 8 }}>{stmt.layout}</span>}
            {stmt.kind === "sample" && <span className="tag" style={{ marginLeft: 8 }}>Sample</span>}
            {stmt.fileStored && <span className="tag" style={{ marginLeft: 8 }} title="The original PDF is kept in this browser only">PDF kept in this browser</span>}
          </h3>
          <div className="bill-meta">
            {fmtDate(stmt.periodStart)} to {fmtDate(stmt.periodEnd)} | {stmt.lines.length} lines | {stmt.fileName}
          </div>
        </div>
        <span className="chips">
          {matching.recon.summaries.get(stmt.id)?.reconciled && <span className="tag ok">Reconciled</span>}
          <span className={`tag ${proof.status === "proven" ? "ok" : proof.status === "break" ? "" : "warn"}`} style={proof.status === "break" ? { background: "#fee2e2", color: "var(--bad)" } : undefined}>
            {proof.label}
          </span>
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div className={`proof ${tone}`}>
            <div className="proof-badge"><span className="dot" />{proof.label}</div>
            <p style={{ margin: "6px 0 0" }}>{proof.detail}</p>
            {proof.status === "break" && proof.breaks.length > 0 && (
              <p style={{ margin: "8px 0 0" }}>
                {proof.breaks.map((b) => (
                  <button key={b.lineId} className="linkbtn" style={{ marginRight: 14 }} onClick={() => jump(b.lineId)}>
                    Jump to line {b.lineNo}
                  </button>
                ))}
              </p>
            )}
            {proof.opening !== null && proof.closing !== null && (
              <div className="proof-sum">
                <div><div className="n">{fmtRM(proof.opening)}</div><div className="l">Opening balance</div></div>
                <div><div className="n">+ {fmtRM(proof.totalCredit)}</div><div className="l">Money in</div></div>
                <div><div className="n">- {fmtRM(proof.totalDebit)}</div><div className="l">Money out</div></div>
                <div><div className="n">= {fmtRM(proof.computedClosing ?? 0)}</div><div className="l">Calculated closing</div></div>
                <div><div className="n">{fmtRM(proof.closing)}</div><div className="l">Closing on statement</div></div>
              </div>
            )}
            {(proof.printed.debit || proof.printed.credit) && (
              <p className="bill-meta" style={{ margin: "10px 0 0" }}>
                Printed totals on the statement:{" "}
                {proof.printed.debit && <>money out {fmtRM(proof.printed.debit.printed)} {proof.printed.debit.ok ? "(agrees with the lines)" : "(does NOT agree with the lines)"}</>}
                {proof.printed.debit && proof.printed.credit && "; "}
                {proof.printed.credit && <>money in {fmtRM(proof.printed.credit.printed)} {proof.printed.credit.ok ? "(agrees with the lines)" : "(does NOT agree with the lines)"}</>}
              </p>
            )}
            <p className="guarantee">{GUARANTEE}</p>
          </div>

          {proof.status === "incomplete" && (
            <div className="row" style={{ marginTop: 14 }}>
              <div><label>Opening balance (RM)</label><input placeholder={stmt.opening === null ? "e.g. 18250.40" : senToPlain(stmt.opening)} value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
              <div><label>Closing balance (RM)</label><input placeholder={stmt.closing === null ? "e.g. 11503.68" : senToPlain(stmt.closing)} value={closing} onChange={(e) => setClosing(e.target.value)} /></div>
              <button className="btn" onClick={saveBalances}>Run the proof</button>
            </div>
          )}

          {stmt.warnings.length > 0 && stmt.warnings.map((w, i) => <div key={i} className="issue info" style={{ marginTop: 10 }}>{w}</div>)}

          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table className="lines">
              <thead>
                <tr><th>#</th><th>Date</th><th className="desc">Description</th><th className="num">Money out</th><th className="num">Money in</th><th className="num">Balance</th><th>Page</th><th /></tr>
              </thead>
              <tbody>
                {stmt.lines.map((l, i) => {
                  const b = breakByLine.get(l.id);
                  const isEditing = editing?.id === l.id;
                  return (
                    <FragmentRows key={l.id}>
                      <tr id={`ln-${stmt.id}-${l.id}`} className={`${b ? "break" : ""} ${flash === l.id ? "flash" : ""}`}>
                        <td>{i + 1}</td>
                        <td>{fmtDate(l.date)}</td>
                        <td className="desc">
                          {l.description}
                          {l.corrected && <div className="bill-meta">Edited by you. The statement printed {l.corrected.debit ? `${fmtRM(l.corrected.debit)} out` : `${fmtRM(l.corrected.credit)} in`}.</div>}
                          {l.directionInferred && <div className="bill-meta">Direction read from the balance change.</div>}
                        </td>
                        {isEditing ? (
                          <>
                            <td className="num"><input aria-label="Money out" value={editing.debit} onChange={(e) => setEditing({ ...editing, debit: e.target.value })} /></td>
                            <td className="num"><input aria-label="Money in" value={editing.credit} onChange={(e) => setEditing({ ...editing, credit: e.target.value })} /></td>
                          </>
                        ) : (
                          <>
                            <td className="num">{l.debit ? fmtRM(l.debit) : ""}</td>
                            <td className="num">{l.credit ? fmtRM(l.credit) : ""}</td>
                          </>
                        )}
                        <td className="num">{l.balance === null ? "" : fmtRM(l.balance)}</td>
                        <td>{l.page}</td>
                        <td className="num">
                          {isEditing ? (
                            <>
                              <button className="linkbtn" onClick={saveEdit}>Save</button>{" "}
                              <button className="linkbtn" onClick={() => { setEditing(null); setEditErr(""); }}>Cancel</button>
                            </>
                          ) : (
                            <button className="linkbtn" disabled={locked} onClick={() => { setEditing({ id: l.id, debit: l.debit ? senToPlain(l.debit) : "", credit: l.credit ? senToPlain(l.credit) : "" }); setEditErr(""); }}>Edit</button>
                          )}
                        </td>
                      </tr>
                      {(b || (isEditing && editErr)) && (
                        <tr className="break-note">
                          <td />
                          <td colSpan={7}>
                            {isEditing && editErr ? editErr : (
                              <>
                                Break at line {b!.lineNo}: expected balance {fmtRM(b!.expected)}, statement shows {fmtRM(b!.found)}.
                                {b!.implied && (
                                  <>
                                    {" "}The printed balance implies {b!.implied.side === "debit" ? "money out" : "money in"} of {fmtRM(b!.implied.amount)}.{" "}
                                    <button className="linkbtn" disabled={locked} onClick={() => patch((s) => ({ ...s, lines: correctLine(s.lines, l.id, b!.implied!.side, b!.implied!.amount) }), `Corrected line ${b!.lineNo} of ${stmt.fileName} to ${b!.implied!.side === "credit" ? "money in" : "money out"} ${fmtRM(b!.implied!.amount)} (amount implied by the printed balance)`)}>
                                      Use {fmtRM(b!.implied.amount)}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </FragmentRows>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Matching stmt={stmt} {...matching} />

          <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <span className="bill-meta">{locked ? "This month is approved and locked. Reopen it to change this statement." : "The proof re-runs after every correction."}</span>
            <span>
              {stmt.fileStored && <button className="btn secondary" style={{ marginRight: 8 }} onClick={() => { if (confirm("Remove the stored PDF? The figures and proof stay.")) dropFile(); }}>Remove file</button>}
              <button className="btn secondary" disabled={locked} title={locked ? "Approved and locked" : undefined} onClick={() => { if (confirm("Remove this statement from the demo?")) remove(); }}>Remove statement</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// A keyed wrapper so one line can render a main row and a note row.
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
