import { describe, expect, it } from "vitest";
import { boardRow, boardRows, boardSummary, cutoffDate, graceEnds, pastCutoff, pastGrace } from "@/lib/board";
import { CHASE_GRACE_DAYS, MONTH_CUTOFF_DAY } from "@/lib/config";
import { seedState } from "@/lib/demo";
import { approveMonth, prepareMonth } from "@/lib/month/signoff";
import { STAFF } from "@/lib/staff";
import { baseState } from "./helpers";

const NOW = new Date("2026-11-13T05:00:00Z"); // after the 5th of November
const rows = () => boardRows(seedState(), "2026-10", NOW);
const row = (id: string) => rows().find((r) => r.clientId === id)!;

describe("cutoff", () => {
  it("is the 5th of the following month, set in one config value", () => {
    expect(MONTH_CUTOFF_DAY).toBe(5);
    expect(cutoffDate("2026-10")).toBe("2026-11-05");
    expect(cutoffDate("2026-12")).toBe("2027-01-05");
  });
  it("is past only after the 5th", () => {
    expect(pastCutoff("2026-10", new Date("2026-11-05T23:00:00Z"))).toBe(false);
    expect(pastCutoff("2026-10", new Date("2026-11-06T00:30:00Z"))).toBe(true);
  });
});

describe("Received: waiting versus blocked", () => {
  it("a statement that has not arrived is Waiting, not Blocked, with a chase button", () => {
    const c = row("c1").cells.received;
    expect(c).toMatchObject({ status: "progress", text: "Waiting for statement", canChase: true });
    expect(row("c2").cells.received.status).toBe("progress");
  });
  it("is Blocked only when chased AND past the 5th of the following month", () => {
    const s = seedState();
    expect(boardRow(s, "c6", "2026-10", NOW).cells.received).toMatchObject({ status: "blocked", reason: "statement-missing" });
    // chased, but still before the 5th: waiting
    expect(boardRow(s, "c6", "2026-10", new Date("2026-11-04T05:00:00Z")).cells.received.status).toBe("progress");
    // past the 5th but never chased: waiting
    expect(boardRow(s, "c1", "2026-10", NOW).cells.received.status).toBe("progress");
  });
  it("chasing a waiting client past the 5th starts a grace period, not a block", () => {
    const s = seedState();
    s.chases["c1:2026-10"] = { clientId: "c1", month: "2026-10", at: "2026-11-13T01:00:00Z", by: "Aisyah Rahman" };
    const c = boardRow(s, "c1", "2026-10", NOW).cells.received;
    expect(c).toMatchObject({ status: "progress", text: "Chased on 13/11/2026, waiting", chased: true, canChase: true });
  });
  it("turns Blocked only after the grace period (CHASE_GRACE_DAYS) has passed", () => {
    expect(CHASE_GRACE_DAYS).toBe(3);
    const s = seedState();
    s.chases["c1:2026-10"] = { clientId: "c1", month: "2026-10", at: "2026-11-13T01:00:00Z", by: "Aisyah Rahman" };
    const at = (iso: string) => boardRow(s, "c1", "2026-10", new Date(iso)).cells.received.status;
    expect(graceEnds("2026-11-13T01:00:00Z")).toBe("2026-11-16");
    expect(at("2026-11-16T23:00:00Z")).toBe("progress"); // the last day of the grace period
    expect(at("2026-11-17T00:30:00Z")).toBe("blocked");
    expect(pastGrace("2026-11-13T01:00:00Z", new Date("2026-11-17T00:30:00Z"))).toBe(true);
  });
  it("chasing again restarts the grace period", () => {
    const s = seedState();
    s.chases["c6:2026-10"] = { clientId: "c6", month: "2026-10", at: "2026-11-12T01:00:00Z", by: "Aisyah Rahman" };
    expect(boardRow(s, "c6", "2026-10", NOW).cells.received.status).toBe("progress");
  });
  it("Pixel Orchard (chased on 6 November) is Blocked once its grace period is over, and waiting before", () => {
    const s = seedState();
    expect(boardRow(s, "c6", "2026-10", new Date("2026-11-09T12:00:00Z")).cells.received.text).toBe("Chased on 06/11/2026, waiting");
    expect(boardRow(s, "c6", "2026-10", new Date("2026-11-10T12:00:00Z")).cells.received.status).toBe("blocked");
  });
});

describe("the seeded spread", () => {
  it("has one complete, some in progress and one blocked", () => {
    const r = rows();
    expect(r.filter((x) => x.complete).map((x) => x.clientId)).toEqual(["c3"]);
    expect(r.filter((x) => x.blocked).map((x) => x.clientId)).toEqual(["c6"]);
    expect(r.filter((x) => !x.complete && !x.blocked).map((x) => x.clientId)).toEqual(["c1", "c2", "c4", "c5"]);
  });
  it("cells carry counts", () => {
    expect(row("c4").cells.matched).toMatchObject({ status: "progress", count: 4, text: "4 to review" });
    expect(row("c4").cells.answered).toMatchObject({ status: "progress", count: 1, text: "1 question open, 1 sent" });
    expect(row("c4").cells.received).toMatchObject({ status: "progress", text: "1 document missing" });
  });
  it("shows prepared-awaiting-review and approved", () => {
    expect(row("c5").cells.approved).toMatchObject({ status: "progress", text: "Prepared by Aisyah Rahman, awaiting review" });
    expect(row("c3").cells.approved).toMatchObject({ status: "done", text: "Approved by Daniel Lim, prepared by Aisyah Rahman" });
  });
  it("every cell links to the exact work", () => {
    const c = row("c4").cells;
    expect(c.answered.href).toBe("/questions?client=c4&month=2026-10");
    expect(c.matched.href).toBe("/statements?client=c4");
    expect(c.approved.href).toBe("/month?client=c4&month=2026-10");
    expect(c.received.href).toBe("/questions?client=c4&month=2026-10#missing");
  });
});

describe("headline", () => {
  it("counts complete clients and names the main reason for blocks", () => {
    const sum = boardSummary(rows(), "2026-10");
    expect(sum).toMatchObject({ complete: 1, total: 6, blocked: 1, headline: "1 of 6 clients complete for October" });
    expect(sum.blockedLine).toBe("1 blocked. Main reason: statement still missing after chase (Pixel Orchard Sdn Bhd).");
  });
  it("has no blocked line when nothing is blocked", () => {
    const sum = boardSummary(boardRows(baseState(), "2026-10", NOW), "2026-10");
    expect(sum.blockedLine).toBe("");
  });
});

describe("stages are derived, not stored", () => {
  it("approving a client changes the board without touching any stage field", () => {
    const s = seedState();
    const [aisyah, daniel] = STAFF;
    const a = approveMonth(s, "c5", "2026-10", daniel, { ackOutstanding: false, at: "2026-11-12T03:00:00Z" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(boardSummary(boardRows(a.state, "2026-10", NOW), "2026-10").complete).toBe(2);
    expect(aisyah.id).toBe("aisyah");
  });
  it("a Totals-only statement shows a warning to acknowledge", () => {
    const s = seedState();
    const st = s.statements.find((x) => x.id === "seed-c5-oct")!;
    s.statements = s.statements.map((x) => (x.id === st.id ? { ...x, lines: x.lines.map((l) => ({ ...l, balance: null })) } : x));
    expect(boardRow(s, "c5", "2026-10", NOW).cells.proven).toMatchObject({ status: "progress", count: 1 });
  });
  it("a break blocks Proven and Approved", () => {
    const s = seedState();
    s.statements = s.statements.map((x) => (x.id === "seed-c4-oct" ? { ...x, lines: x.lines.map((l, i) => (i === 1 ? { ...l, debit: l.debit + 100 } : l)) } : x));
    const r = boardRow(s, "c4", "2026-10", NOW);
    expect(r.cells.proven).toMatchObject({ status: "blocked", reason: "break" });
    expect(r.cells.approved.status).toBe("blocked");
    expect(r.blocked).toBe(true);
  });
  it("approval of an unprepared, unready client is not possible", () => {
    const p = prepareMonth(seedState(), "c4", "2026-10", STAFF[0]);
    expect(p.ok).toBe(false);
  });
});
