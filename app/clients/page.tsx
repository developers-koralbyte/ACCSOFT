"use client";

import { useEffect } from "react";
import { readMode, useDocflow, useStaff } from "@/lib/store";
import { LEDGERS, type LedgerId } from "@/lib/export/ledgers";
import { addActivity } from "@/lib/activity";
import { monthName } from "@/lib/money";

function reminderText(clientName: string, missing: number): string {
  return (
    `Hi, this is a friendly reminder from your accounting team. ` +
    `We are still missing about ${missing} receipts and invoices for ${clientName} this month. ` +
    `Please send photos or PDFs here on WhatsApp so we can close your books on time. Terima kasih!`
  );
}

export default function ClientsPage() {
  const { state, update, reset } = useDocflow();
  const staff = useStaff();

  // SMEs using "My business" mode land on their own dashboard instead of the firm client list
  useEffect(() => {
    if (readMode() === "business") window.location.replace("/business");
  }, []);
  // The month board is the home screen now; this page is the plain client list.

  if (!state) return <main className="page">Loading...</main>;

  const { clients, bills } = state;
  const expected = clients.reduce((a, c) => a + c.docsExpected, 0);
  const received = clients.reduce((a, c) => a + c.docsReceived, 0);
  const pending = bills.filter((b) => b.status === "pending").length;
  const incomplete = clients.filter((c) => c.docsReceived < c.docsExpected).length;

  function chase(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const missing = c.docsExpected - c.docsReceived;
    const url = `https://wa.me/${c.phone}?text=${encodeURIComponent(reminderText(c.name, missing))}`;
    window.open(url, "_blank", "noopener");
    update((s) => ({
      ...s,
      clients: s.clients.map((x) => (x.id === id ? { ...x, lastReminder: new Date().toISOString() } : x)),
    }));
  }

  return (
    <main className="page">
      <h1>Clients</h1>
      <p className="sub">See which clients still owe documents this month, and chase them in one click.</p>

      <div className="banner">
        Demo data is loaded so you can click through the full flow. Saved in this browser only.{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); if (window.confirm("Restore the sample data? Everything you changed in this demo is removed.")) reset(); }}>Reset demo data</a>
      </div>

      <div className="grid kpis">
        <div className="card kpi"><div className="n">{clients.length}</div><div className="l">Active clients</div></div>
        <div className="card kpi"><div className="n">{received}/{expected}</div><div className="l">Documents received this month</div></div>
        <div className="card kpi"><div className="n">{incomplete}</div><div className="l">Clients still owing documents</div></div>
        <div className="card kpi"><div className="n">{pending}</div><div className="l">Bills waiting for your approval</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Client</th><th>Documents this month</th><th>Status</th><th>Ledger</th><th>Year end</th><th></th></tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const pct = Math.round((c.docsReceived / c.docsExpected) * 100);
              const done = c.docsReceived >= c.docsExpected;
              return (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <div className={`bar ${done ? "done" : ""}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{c.docsReceived} of {c.docsExpected}</div>
                  </td>
                  <td>
                    {done ? <span className="tag ok">Complete</span> : <span className="tag warn">{c.docsExpected - c.docsReceived} missing</span>}
                    {c.lastReminder && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        Chased {new Date(c.lastReminder).toLocaleDateString("en-MY")}
                      </div>
                    )}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <select aria-label={`Ledger for ${c.name}`} value={c.ledger ?? "xero"} onChange={(e) => update((s) => addActivity({ ...s, clients: s.clients.map((x) => (x.id === c.id ? { ...x, ledger: e.target.value as LedgerId } : x)) }, { clientId: c.id, by: staff.name, kind: "ledger", text: `Set the ledger to ${LEDGERS.find((l) => l.id === e.target.value)?.label}` }))}>
                      {LEDGERS.map((l) => <option key={l.id} value={l.id}>{l.label}{l.draft ? " (draft template)" : ""}</option>)}
                    </select>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <select aria-label={`Financial year end for ${c.name}`} value={c.fyEndMonth ?? 12} onChange={(e) => update((s) => ({ ...s, clients: s.clients.map((x) => (x.id === c.id ? { ...x, fyEndMonth: Number(e.target.value) } : x)) }))}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(`2026-${String(m).padStart(2, "0")}`).split(" ")[0]}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!done && <button className="btn" onClick={() => chase(c.id)}>Chase on WhatsApp</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
