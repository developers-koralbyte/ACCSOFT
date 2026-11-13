"use client";

import { useEffect } from "react";
import { readMode, useDocflow } from "@/lib/store";
import { clearSamples } from "@/lib/demo";
import { boardRows } from "@/lib/board";
import { DEMO_MONTH } from "@/lib/config";
import { monthName } from "@/lib/money";
import { BoardTable } from "../board-table";
import { billsToCsv, downloadCsv } from "@/lib/csv";
import { money } from "@/lib/malaysia";
import { fmtDate } from "@/lib/money";

export default function BusinessPage() {
  const { state, update, reset } = useDocflow();

  // opened directly while in firm mode: switch to this view's data
  useEffect(() => {
    if (readMode() !== "business") {
      try {
        window.localStorage.setItem("docflow-mode", "business");
      } catch {
        /* ignore */
      }
      window.location.reload();
    }
  }, []);

  if (!state) return <main className="page">Loading...</main>;

  const bills = [...state.bills].sort((a, b) => (a.date < b.date ? 1 : -1));
  const waiting = bills.filter((b) => b.status === "pending").length;
  const filed = bills.filter((b) => b.status !== "pending");
  const spend = filed.reduce((a, b) => a + b.total, 0);
  const sst = filed.reduce((a, b) => a + b.tax, 0);
  const hasSamples = state.bills.some((b) => b.sample);
  const myRow = boardRows(state, DEMO_MONTH, new Date(), ["me"]);

  return (
    <main className="page">
      <h1>My documents</h1>
      <p className="sub">
        Every invoice, bill and receipt in one place, read and sorted for you. Send them here instead of leaving them
        buried in WhatsApp, then hand your accountant one clean file.
      </p>

      <div className="banner">
        {hasSamples ? "Sample documents are loaded so you can click through. They are invented and labelled Sample. " : "Your own documents only. "}
        Saved in this browser only.{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); reset(); }}>Reset demo data</a>
        {hasSamples && (
          <>
            {" | "}
            <a href="#" onClick={(e) => { e.preventDefault(); update(clearSamples); }}>Clear samples</a>
          </>
        )}
      </div>

      <div className="section-head" style={{ margin: "0 0 8px" }}>
        <h2 style={{ fontSize: 18 }}>{monthName(DEMO_MONTH)}: where your month stands</h2>
      </div>
      <BoardTable rows={myRow} showName={false} />
      <p className="bill-meta" style={{ margin: "8px 0 20px" }}>Add a bank statement and the stages fill in. <a href="/statements">Add a statement</a> | <a href="/month?client=me">Mark the month done</a></p>

      <div className="grid kpis">
        <div className="card kpi"><div className="n">{bills.length}</div><div className="l">Documents captured</div></div>
        <div className="card kpi"><div className="n">{waiting}</div><div className="l">Waiting for your check</div></div>
        <div className="card kpi"><div className="n">{money(spend, "MYR")}</div><div className="l">Filed spend</div></div>
        <div className="card kpi"><div className="n">{money(sst, "MYR")}</div><div className="l">Tax paid on filed documents</div></div>
      </div>

      <div className="card cta">
        <div>
          <strong>Documents stuck in WhatsApp?</strong>
          <div className="bill-meta">Export the chat with media and everything in it is read in one go.</div>
        </div>
        <div className="actions">
          <a className="btn" href="/import">Import WhatsApp chat</a>
          <a className="btn secondary" href="/upload">Add files</a>
        </div>
      </div>

      <div className="section-head">
        <h2 style={{ fontSize: 18 }}>All documents</h2>
        <button className="btn secondary" disabled={!bills.length} onClick={() => downloadCsv("docflow-documents.csv", billsToCsv(bills))}>
          Export CSV for my accountant
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {bills.length === 0 ? (
          <div className="empty">Nothing here yet. Import a WhatsApp chat or add files.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Supplier</th><th>Category</th><th>Total</th><th>Sent by</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{fmtDate(b.date)}</td>
                  <td>{b.supplier || "Unknown supplier"}{b.sample && <span className="tag" style={{ marginLeft: 8 }}>Sample</span>}</td>
                  <td>{b.account}</td>
                  <td>{money(b.total, b.currency)}</td>
                  <td>{b.sentBy || "-"}</td>
                  <td>
                    {b.status === "pending" ? <span className="tag warn">Needs check</span> : <span className="tag ok">{b.status === "posted" ? "Posted" : "Filed"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {waiting > 0 && (
        <p style={{ marginTop: 12 }}><a href="/inbox">Check the {waiting} waiting document{waiting === 1 ? "" : "s"}</a></p>
      )}
    </main>
  );
}
