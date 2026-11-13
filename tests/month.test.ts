import { describe, expect, it } from "vitest";
import { approvalBlockers, approveMonth, acknowledgeTotalsOnly, prepareMonth, readiness, reopenMonth } from "@/lib/month/signoff";
import { getMonth, isMonthLocked } from "@/lib/month/records";
import { lockedBills, reconcileForClient } from "@/lib/month/snapshot";
import { markBankOnly } from "@/lib/match/actions";
import { STAFF } from "@/lib/staff";
import type { AppState } from "@/lib/types";
import { baseState, bill, stmt } from "./helpers";

const [aisyah, daniel] = STAFF;
const OCT = "2026-10";

// A statement with one matched payment and one bank charge, reconciled once the charge is confirmed.
function reconciled(): AppState {
  const s = stmt("oct", 5_000_000, [
    { date: "2026-10-09", desc: "TRANSFER TO A/C RIMAU TYRE CENTRE", debit: 120000 },
    { date: "2026-10-30", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1500 },
  ]);
  return baseState({
    statements: [s],
    bills: [bill("b1", "Rimau Tyre Centre", "RT-5521", "2026-10-08", 1200, { account: "Motor vehicle and fuel" })],
    decisions: markBankOnly({}, "oct:l2", "Bank charges", "NONE", "Aisyah Rahman"),
  });
}

describe("readiness: what must be true before approval", () => {
  it("needs a statement for the month", () => {
    const r = readiness(baseState(), "c1", OCT);
    expect(r.ready).toBe(false);
    expect(r.missing[0]).toContain("No bank statement for October 2026");
  });
  it("is ready when proven, reconciled and nothing is open", () => {
    expect(readiness(reconciled(), "c1", OCT)).toMatchObject({ ready: true, missing: [] });
  });
  it("names a break", () => {
    const s = stmt("oct", 5_000_000, [{ date: "2026-10-09", desc: "X", debit: 100 }], { breakAt: 0 });
    expect(readiness(baseState({ statements: [s] }), "c1", OCT).missing.join(" ")).toContain("has a break");
  });
  it("needs unconfirmed bank only lines and suggestions cleared", () => {
    const st = reconciled();
    st.decisions = {};
    expect(readiness(st, "c1", OCT).missing.join(" ")).toContain("1 bank only line to confirm");
  });
  it("needs every question answered", () => {
    const s = stmt("oct", 5_000_000, [{ date: "2026-10-12", desc: "IBG PAYMENT ALI TRADING", debit: 240000 }]);
    const r = readiness(baseState({ statements: [s] }), "c1", OCT);
    expect(r.checks.find((c) => c.id === "questions")).toMatchObject({ ok: false });
    expect(r.missing.join(" ")).toContain("1 question is open");
  });
  it("a totals-only statement needs its warning acknowledged", () => {
    const s = stmt("oct", 5_000_000, [{ date: "2026-10-30", desc: "SERVICE CHARGE", debit: 1500 }], { balance: false });
    let st = baseState({ statements: [s], decisions: markBankOnly({}, "oct:l1", "Bank charges", "NONE", "A") });
    expect(readiness(st, "c1", OCT).missing.join(" ")).toContain("Acknowledge that oct.pdf is proven on totals only");
    st = acknowledgeTotalsOnly(st, "c1", OCT, "oct", aisyah);
    expect(readiness(st, "c1", OCT).ready).toBe(true);
    expect(st.activity.at(-1)).toMatchObject({ kind: "acknowledged", by: "Aisyah Rahman" });
  });
});

describe("two-step sign-off", () => {
  it("cannot be prepared until the month is ready", () => {
    const r = prepareMonth(baseState(), "c1", OCT, aisyah);
    expect(r.ok).toBe(false);
  });
  it("Prepared by then Reviewed by, with names and timestamps", () => {
    const p = prepareMonth(reconciled(), "c1", OCT, aisyah, "2026-11-04T01:00:00Z");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const a = approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: false, at: "2026-11-04T06:00:00Z" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const rec = getMonth(a.state, "c1", OCT);
    expect(rec.prepared).toEqual({ staffId: "aisyah", name: "Aisyah Rahman", at: "2026-11-04T01:00:00Z" });
    expect(rec.reviewed).toEqual({ staffId: "daniel", name: "Daniel Lim", at: "2026-11-04T06:00:00Z" });
    expect(isMonthLocked(a.state, "c1", OCT)).toBe(true);
  });
  it("the reviewer must be a different person", () => {
    const p = prepareMonth(reconciled(), "c1", OCT, aisyah);
    if (!p.ok) throw new Error("not prepared");
    expect(approvalBlockers(p.state, "c1", OCT, aisyah, false).join(" ")).toContain("different person");
    expect(approveMonth(p.state, "c1", OCT, aisyah, { ackOutstanding: false }).ok).toBe(false);
  });
  it("cannot be approved before it is prepared", () => {
    expect(approvalBlockers(reconciled(), "c1", OCT, daniel, false).join(" ")).toContain("Step 1 is not done");
  });
  it("outstanding documents need a tick, and the approval is logged with the count", () => {
    const st = reconciled();
    st.history = ["2026-07", "2026-08", "2026-09"].map((month) => ({ clientId: "c1", month, kind: "Rent", label: "Rent" }));
    const p = prepareMonth(st, "c1", OCT, aisyah);
    if (!p.ok) throw new Error("not prepared");
    expect(approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: false }).ok).toBe(false);
    expect(approvalBlockers(p.state, "c1", OCT, daniel, false).join(" ")).toContain("1 document is still outstanding");
    const a = approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: true });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.activity.at(-1)?.text).toContain("Approved with 1 document outstanding");
    expect(getMonth(a.state, "c1", OCT).outstandingAcknowledged).toBe(1);
    expect(getMonth(a.state, "c1", OCT).snapshot?.missingDocs).toEqual(["Rent"]);
  });
  it("'Not needed this month' means no acknowledgement is needed", () => {
    const st = reconciled();
    st.history = ["2026-07", "2026-08", "2026-09"].map((month) => ({ clientId: "c1", month, kind: "Rent", label: "Rent" }));
    st.months["c1:2026-10"] = { clientId: "c1", month: OCT, waived: ["Rent"], ackTotalsOnly: [], history: [] };
    const p = prepareMonth(st, "c1", OCT, aisyah);
    if (!p.ok) throw new Error("x");
    expect(approvalBlockers(p.state, "c1", OCT, daniel, false)).toEqual([]);
  });
  it("business mode approves in one step", () => {
    const you = { id: "you", name: "You", title: "Owner" };
    const a = approveMonth(reconciled(), "c1", OCT, you, { ackOutstanding: false, singleStep: true });
    expect(a.ok).toBe(true);
  });
});

describe("snapshot: an approved month does not change", () => {
  function approved() {
    const p = prepareMonth(reconciled(), "c1", OCT, aisyah, "2026-11-04T01:00:00Z");
    if (!p.ok) throw new Error("x");
    const a = approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: false, at: "2026-11-04T06:00:00Z" });
    if (!a.ok) throw new Error("x");
    return a.state;
  }
  it("stores proof, line states, matches, categories and tax codes", () => {
    const snap = getMonth(approved(), "c1", OCT).snapshot!;
    const st = snap.statements[0];
    expect(st).toMatchObject({ proofStatus: "proven", reconciled: true, opening: 5_000_000 });
    expect(st.lines[0]).toMatchObject({ state: "matched", rule: "payee-7d", billIds: ["b1"], category: "Motor vehicle and fuel", taxCode: "NONE" });
    expect(st.lines[1]).toMatchObject({ state: "bank-only", category: "Bank charges", categoryConfirmed: true });
    expect(snap.bills).toEqual([{ id: "b1", supplier: "Rimau Tyre Centre", invoiceNo: "RT-5521", date: "2026-10-08", subtotal: 120000, tax: 0, total: 120000, category: "Motor vehicle and fuel", taxCode: "NONE" }]);
  });
  it("editing a bill afterwards does not change the approved results", () => {
    const st = approved();
    const edit = (x: AppState): AppState => ({ ...x, bills: x.bills.map((b) => ({ ...b, supplier: "Someone Else", total: 99, subtotal: 99, account: "Rent", taxCode: "SVC8", date: "2020-01-01" })) });
    const r = reconcileForClient(edit(st), "c1");
    expect(r.results.get("oct:l1")).toMatchObject({ state: "matched", rule: "payee-7d", billIds: ["b1"], category: "Motor vehicle and fuel", taxCode: "NONE" });
    expect(r.summaries.get("oct")?.reconciled).toBe(true);
    // the snapshot is what protects it: once the month is reopened, the same edit DOES change the live result
    const reopened = reopenMonth(st, "c1", OCT, daniel, "Check");
    if (!reopened.ok) throw new Error("x");
    expect(reconcileForClient(edit(reopened.state), "c1").results.get("oct:l1")!.state).not.toBe("matched");
  });
  it("a new bill added afterwards cannot change an approved line or take a used document", () => {
    const st = approved();
    const withNew: AppState = { ...st, bills: [...st.bills, bill("new", "Rimau Tyre Centre", "RT-9999", "2026-10-09", 1200)] };
    const r = reconcileForClient(withNew, "c1");
    expect(r.results.get("oct:l1")).toMatchObject({ state: "matched", billIds: ["b1"] });
    expect(r.consumed.has("new")).toBe(false);
  });
  it("documents used by an approved month stay used", () => {
    const r = reconcileForClient(approved(), "c1");
    expect(r.consumed.has("b1")).toBe(true);
  });
  it("locks the matched documents until the month is reopened", () => {
    const st = approved();
    expect(lockedBills(st).get("b1")).toEqual({ clientId: "c1", month: OCT });
    expect(lockedBills(st).has("other")).toBe(false);
  });
});

describe("reopening", () => {
  it("needs a reason, and removes the lock and the snapshot", () => {
    const p = prepareMonth(reconciled(), "c1", OCT, aisyah);
    if (!p.ok) throw new Error("x");
    const a = approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: false });
    if (!a.ok) throw new Error("x");
    expect(reopenMonth(a.state, "c1", OCT, daniel, "   ").ok).toBe(false);
    const r = reopenMonth(a.state, "c1", OCT, daniel, "Client sent a missing invoice", "2026-11-20T02:00:00Z");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = getMonth(r.state, "c1", OCT);
    expect(rec.snapshot).toBeUndefined();
    expect(rec.reviewed).toBeUndefined();
    expect(rec.prepared).toBeUndefined();
    expect(isMonthLocked(r.state, "c1", OCT)).toBe(false);
    expect(lockedBills(r.state).size).toBe(0);
    expect(r.state.activity.at(-1)).toMatchObject({ kind: "reopened", by: "Daniel Lim", at: "2026-11-20T02:00:00Z" });
    expect(r.state.activity.at(-1)?.text).toContain("Client sent a missing invoice");
    expect(rec.history.at(-1)?.text).toBe("Reopened: Client sent a missing invoice");
  });
});

describe("activity log", () => {
  it("records who and when for prepare and approve", () => {
    const p = prepareMonth(reconciled(), "c1", OCT, aisyah, "2026-11-04T01:00:00Z");
    if (!p.ok) throw new Error("x");
    const a = approveMonth(p.state, "c1", OCT, daniel, { ackOutstanding: false, at: "2026-11-04T06:00:00Z" });
    if (!a.ok) throw new Error("x");
    expect(a.state.activity.map((e) => [e.kind, e.by, e.at])).toEqual([
      ["prepared", "Aisyah Rahman", "2026-11-04T01:00:00Z"],
      ["approval", "Daniel Lim", "2026-11-04T06:00:00Z"],
    ]);
  });
});
