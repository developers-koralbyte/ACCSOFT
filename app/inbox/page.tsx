"use client";

import { useState } from "react";
import { useDocflow } from "@/lib/store";
import { ACCOUNTS, TAX_CODES, flagsFor, money } from "@/lib/malaysia";
import type { Bill } from "@/lib/types";

const SOURCE_LABEL: Record<Bill["source"], string> = {
  whatsapp: "WhatsApp",
  upload: "Upload",
  email: "Email",
};

export default function InboxPage() {
  const { state, update } = useDocflow();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!state) return <main className="page">Loading...</main>;

  const pending = state.bills.filter((b) => b.status === "pending");
  const posted = state.bills.filter((b) => b.status === "posted");
  const clientName = (id: string) => state.clients.find((c) => c.id === id)?.name ?? "Unknown client";

  function patch(id: string, fields: Partial<Bill>) {
    update((s) => ({
      ...s,
      bills: s.bills.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...fields };
        if ("subtotal" in fields || "tax" in fields) {
          next.total = Math.round((next.subtotal + next.tax) * 100) / 100;
        }
        return next;
      }),
    }));
  }

  async function approve(bill: Bill) {
    setBusy(bill.id);
    setErrors((e) => ({ ...e, [bill.id]: "" }));
    try {
      const res = await fetch("/api/xero/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bill),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Posting failed");
      patch(bill.id, { status: "posted", postedRef: json.ref });
    } catch (err) {
      setErrors((e) => ({ ...e, [bill.id]: err instanceof Error ? err.message : "Posting failed" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <h1>Review queue</h1>
      <p className="sub">
        Every document is read and coded for you. Check the figures, then approve. Bills go into Xero as drafts so you
        keep final control.
      </p>

      {pending.length === 0 && <div className="card empty">Nothing waiting. Add documents or wait for clients to send them.</div>}

      {pending.map((b) => {
        const flags = flagsFor(b, state.bills);
        return (
          <div className="card bill" key={b.id}>
            <div className="bill-head">
              <div>
                <h3>{b.supplier || "Unknown supplier"}</h3>
                <div className="bill-meta">
                  {clientName(b.clientId)} | via {SOURCE_LABEL[b.source]}
                  {b.fileName ? ` | ${b.fileName}` : ""} | confidence {Math.round(b.confidence * 100)}%
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{money(b.total, b.currency)}</div>
            </div>

            <div className="fields">
              <div><label>Supplier</label><input value={b.supplier} onChange={(e) => patch(b.id, { supplier: e.target.value })} /></div>
              <div><label>Invoice number</label><input value={b.invoiceNo} onChange={(e) => patch(b.id, { invoiceNo: e.target.value })} /></div>
              <div><label>Date</label><input type="date" value={b.date} onChange={(e) => patch(b.id, { date: e.target.value })} /></div>
              <div>
                <label>Account</label>
                <select value={b.account} onChange={(e) => patch(b.id, { account: e.target.value })}>
                  {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label>Subtotal</label><input type="number" step="0.01" value={b.subtotal} onChange={(e) => patch(b.id, { subtotal: Number(e.target.value) })} /></div>
              <div><label>Tax</label><input type="number" step="0.01" value={b.tax} onChange={(e) => patch(b.id, { tax: Number(e.target.value) })} /></div>
              <div>
                <label>Tax code</label>
                <select value={b.taxCode} onChange={(e) => patch(b.id, { taxCode: e.target.value })}>
                  {TAX_CODES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
              <div><label>Description</label><input value={b.description} onChange={(e) => patch(b.id, { description: e.target.value })} /></div>
            </div>

            {flags.length > 0 && (
              <ul className="flags">
                {flags.map((f, i) => <li key={i} className={f.level}>{f.level === "warn" ? "Check: " : "Note: "}{f.text}</li>)}
              </ul>
            )}
            {errors[b.id] && <div className="err" style={{ marginTop: 8 }}>{errors[b.id]}</div>}

            <div className="actions">
              <button className="btn secondary" onClick={() => update((s) => ({ ...s, bills: s.bills.filter((x) => x.id !== b.id) }))}>
                Reject
              </button>
              <button className="btn green" disabled={busy === b.id} onClick={() => approve(b)}>
                {busy === b.id ? "Posting..." : "Approve and post to Xero"}
              </button>
            </div>
          </div>
        );
      })}

      {posted.length > 0 && (
        <>
          <h2 style={{ marginTop: 36, fontSize: 18 }}>Posted</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Client</th><th>Supplier</th><th>Total</th><th>Reference</th></tr></thead>
              <tbody>
                {posted.map((b) => (
                  <tr key={b.id}>
                    <td>{clientName(b.clientId)}</td>
                    <td>{b.supplier}</td>
                    <td>{money(b.total, b.currency)}</td>
                    <td><span className="tag ok">{b.postedRef}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
