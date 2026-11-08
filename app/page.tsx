"use client";

import { useEffect } from "react";
import { readMode, useDocflow } from "@/lib/store";

function reminderText(clientName: string, missing: number): string {
  return (
    `Hi, this is a friendly reminder from your accounting team. ` +
    `We are still missing about ${missing} receipts and invoices for ${clientName} this month. ` +
    `Please send photos or PDFs here on WhatsApp so we can close your books on time. Terima kasih!`
  );
}

export default function ClientsPage() {
  const { state, update, reset } = useDocflow();

  // SMEs using "My business" mode land on their own dashboard instead of the firm client list
  useEffect(() => {
    if (readMode() === "business") window.location.replace("/business");
  }, []);

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
        <a href="#" onClick={(e) => { e.preventDefault(); reset(); }}>Reset demo data</a>
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
            <tr><th>Client</th><th>Documents this month</th><th>Status</th><th></th></tr>
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
