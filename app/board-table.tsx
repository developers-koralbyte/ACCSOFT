"use client";

import { STAGES, type BoardRow, type Cell } from "@/lib/board";

// One row per client, five stages across. Shared by the firm home screen and the business view.
export function BoardTable({ rows, onChase, showName = true }: { rows: BoardRow[]; onChase?: (clientId: string) => void; showName?: boolean }) {
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="board">
        <thead>
          <tr>
            {showName && <th>Client</th>}
            {STAGES.map((s) => <th key={s.id}>{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientId}>
              {showName && (
                <td style={{ minWidth: 170 }}>
                  <strong>{r.name}</strong>
                  <div className="bill-meta">{r.complete ? "Complete" : r.blocked ? "Blocked" : "In progress"}</div>
                </td>
              )}
              {STAGES.map((s) => {
                const c: Cell = r.cells[s.id];
                return (
                  <td key={s.id} style={{ verticalAlign: "top" }}>
                    <a className={`cell ${c.status}${c.idle ? " idle" : ""}`} href={c.href} data-stage={s.id} data-status={c.status}>
                      <span className="cell-state">{c.status === "done" ? "Done" : c.status === "blocked" ? "Blocked" : c.idle ? "Not started" : "In progress"}</span>
                      <span className="cell-text">{c.text}</span>
                    </a>
                    {c.canChase && onChase && (
                      <button className="btn secondary chase" onClick={() => onChase(r.clientId)}>{c.chased ? "Chase again" : "Chase"}</button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
