"use client";

import { useEffect, useMemo, useState } from "react";
import { readMode, useDocflow, useStaff } from "@/lib/store";
import { useQueryParam } from "@/lib/useQuery";
import { DEMO_MONTH } from "@/lib/config";
import { boardRows, boardSummary } from "@/lib/board";
import { monthName, monthOf } from "@/lib/money";
import { BoardTable } from "./board-table";
import { chaseClient } from "./chase-action";

export default function BoardPage() {
  const { state, update, reset } = useDocflow();
  const staff = useStaff();
  const [qMonth, setQMonth] = useQueryParam("month");
  const [note, setNote] = useState("");

  // SMEs using "My business" mode land on their own dashboard instead of the firm board
  useEffect(() => {
    if (readMode() === "business") window.location.replace("/business");
  }, []);

  const month = qMonth || DEMO_MONTH;
  const rows = useMemo(() => (state ? boardRows(state, month, new Date()) : []), [state, month]);
  if (!state) return <main className="page">Loading...</main>;

  const sum = boardSummary(rows, month);
  const months = Array.from(new Set([DEMO_MONTH, month, ...state.statements.map((s) => monthOf(s.periodEnd))])).sort().reverse();

  function chase(clientId: string) {
    const res = chaseClient(update, state!, clientId, month, staff.name);
    setNote(res.ok ? "WhatsApp opened with the chase message ready. Press send there." : "Your browser blocked the WhatsApp window. Allow pop-ups to chase from here.");
  }

  return (
    <main className="page">
      <div className="section-head" style={{ margin: "0 0 4px" }}>
        <h1 style={{ margin: 0 }}>{sum.headline}</h1>
        <div>
          <label style={{ display: "inline", marginRight: 8 }}>Month</label>
          <select style={{ width: "auto" }} value={month} onChange={(e) => setQMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
      </div>
      <p className="sub" style={{ marginBottom: 14 }}>
        {sum.blockedLine || "Nothing is blocked."} Click any cell to open the exact work. Every stage is worked out from the data, never stored by hand.
      </p>
      {note && <div className="issue info">{note}</div>}

      <div className="banner" style={{ marginBottom: 14 }}>
        Demo data is loaded so you can click through the full flow. Saved in this browser only.{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); reset(); }}>Reset demo data</a>
      </div>

      <BoardTable rows={rows} onChase={chase} />
      <p className="bill-meta" style={{ marginTop: 10 }}>
        A statement is due by the 5th of the following month. A missing statement is Blocked only after the client has been chased and that date has passed. Until then it is Waiting.
      </p>
    </main>
  );
}
