import { describe, expect, it } from "vitest";
import { reconcileClient, lineKey } from "@/lib/match/engine";
import { acceptSuggestion, linkDocument, markBankOnly, planAnswer, recordAnswer, rejectSuggestion } from "@/lib/match/actions";
import { findMemory } from "@/lib/match/memory";
import type { LineDecision, ModelSuggestion, PayeeMemory } from "@/lib/match/types";
import { bill, stmt } from "./helpers";

const run = (statements: ReturnType<typeof stmt>[], bills: ReturnType<typeof bill>[], extra: { decisions?: Record<string, LineDecision>; memory?: PayeeMemory["c1"]; model?: ModelSuggestion[] } = {}) =>
  reconcileClient({ statements, bills, decisions: extra.decisions ?? {}, memory: extra.memory ?? {}, modelSuggestions: extra.model });

const OPEN = 5_000_000;

describe("rule 1: exact amount + reference", () => {
  const s = stmt("s1", OPEN, [{ date: "2026-10-05", desc: "TRANSFER TO A/C LEMBAH POWER UTILITIES LPU-88213-10", debit: 148000 }]);
  it("matches and records the rule", () => {
    const r = run([s], [bill("b1", "Lembah Power Utilities", "LPU-88213-10", "2026-09-29", 1480)]);
    const x = r.results.get(lineKey("s1", "l1"))!;
    expect(x.state).toBe("matched");
    expect(x.rule).toBe("reference");
    expect(x.ruleLabel).toContain("Rule 1");
    expect(x.billIds).toEqual(["b1"]);
  });
  it("ignores dashes, spaces and case on both sides", () => {
    const r = run([s], [bill("b1", "Whoever", "lpu 88213 10", "2026-01-01", 1480)]);
    expect(r.results.get(lineKey("s1", "l1"))!.rule).toBe("reference");
  });
  it("is not limited by date, but the amount must be exact", () => {
    expect(run([s], [bill("b1", "X", "LPU-88213-10", "2025-01-01", 1480)]).results.get(lineKey("s1", "l1"))!.rule).toBe("reference");
    const diff = run([s], [bill("b1", "X", "LPU-88213-10", "2026-09-29", 1480.01)]).results.get(lineKey("s1", "l1"))!;
    expect(diff.state).toBe("suggested"); // the reference agrees but the amount differs: needs a click
    expect(diff.suggestSource).toBe("reference-differs");
  });
});

describe("rule 2: exact amount + payee, within 7 days", () => {
  const line = (date: string) => stmt("s1", OPEN, [{ date, desc: "DUITNOW QR TRADEWIND COURIER SDN BHD", debit: 64800 }]);
  const doc = (date: string) => bill("b5", "Tradewind Courier Sdn Bhd", "TC-1", date, 648);
  it("matches inside the window, both directions", () => {
    expect(run([line("2026-10-21")], [doc("2026-10-19")]).results.get("s1:l1")!.rule).toBe("payee-7d");
    expect(run([line("2026-10-21")], [doc("2026-10-28")]).results.get("s1:l1")!.rule).toBe("payee-7d"); // exactly 7 days after
    expect(run([line("2026-10-21")], [doc("2026-10-14")]).results.get("s1:l1")!.rule).toBe("payee-7d"); // exactly 7 days before
  });
  it("8 days apart is only a suggestion", () => {
    const x = run([line("2026-10-21")], [doc("2026-10-13")]).results.get("s1:l1")!;
    expect(x.state).toBe("suggested");
    expect(x.suggestSource).toBe("near-miss");
  });
  it("wrong payee or wrong amount does not match", () => {
    expect(run([line("2026-10-21")], [bill("b", "Other Co", "", "2026-10-10", 648)]).results.get("s1:l1")!.state).not.toBe("matched");
    expect(run([line("2026-10-21")], [bill("b", "Tradewind Courier", "", "2026-10-21", 648.5)]).results.get("s1:l1")!.state).toBe("unexplained");
    // a different payee with the same amount close in date is still caught, but only by rule 3
    expect(run([line("2026-10-21")], [bill("b", "Other Co", "", "2026-10-21", 648)]).results.get("s1:l1")!.rule).toBe("single-3d");
  });
});

describe("rule 3: exact amount, single candidate, within 3 days", () => {
  const s = stmt("s1", OPEN, [{ date: "2026-10-22", desc: "FPX PAYMENT MERCHANT 5519 REF 77120045", debit: 115000 }]);
  it("matches a lone candidate within 3 days", () => {
    expect(run([s], [bill("b6", "Mutiara Packaging", "MP-1", "2026-10-21", 1150)]).results.get("s1:l1")!.rule).toBe("single-3d");
    expect(run([s], [bill("b6", "Mutiara Packaging", "MP-1", "2026-10-25", 1150)]).results.get("s1:l1")!.rule).toBe("single-3d");
  });
  it("4 days apart does not match", () => {
    expect(run([s], [bill("b6", "Mutiara Packaging", "MP-1", "2026-10-26", 1150)]).results.get("s1:l1")!.state).toBe("unexplained");
  });
  it("two candidate documents means no automatic match", () => {
    const r = run([s], [bill("a", "One Co", "", "2026-10-21", 1150), bill("b", "Two Co", "", "2026-10-23", 1150)]);
    expect(r.results.get("s1:l1")!.state).toBe("unexplained");
  });
  it("two payments competing for one document means no automatic match", () => {
    const two = stmt("s1", OPEN, [
      { date: "2026-10-22", desc: "FPX PAYMENT A", debit: 115000 },
      { date: "2026-10-23", desc: "FPX PAYMENT B", debit: 115000 },
    ]);
    const r = run([two], [bill("only", "One Co", "", "2026-10-22", 1150)]);
    expect(r.results.get("s1:l1")!.state).not.toBe("matched");
    expect(r.results.get("s1:l2")!.state).not.toBe("matched");
  });
});

describe("order of the rules", () => {
  it("a reference match wins over a payee match for the same document", () => {
    const s = stmt("s1", OPEN, [{ date: "2026-10-05", desc: "BINTANG STATIONERY INV BS-77001", debit: 91300 }]);
    const r = run([s], [bill("b", "Bintang Stationery", "BS-77001", "2026-10-04", 913)]);
    expect(r.results.get("s1:l1")!.rule).toBe("reference");
  });
  it("passes run over every line before the next pass, so a certain match is never stolen by a looser rule", () => {
    // line 1 could match document X by payee (rule 2) but line 2 carries X's reference (rule 1) and must win it
    const s = stmt("s1", OPEN, [
      { date: "2026-10-05", desc: "TRANSFER ACME SUPPLIES", debit: 50000 },
      { date: "2026-10-06", desc: "TRANSFER REF INV-ACME-77", debit: 50000 },
    ]);
    const r = run([s], [bill("X", "Acme Supplies", "INV-ACME-77", "2026-10-05", 500)]);
    expect(r.results.get("s1:l2")!.rule).toBe("reference");
    expect(r.results.get("s1:l1")!.state).not.toBe("matched");
  });
});

describe("a document is matched once across all of a client's statements", () => {
  it("is not used twice", () => {
    const a = stmt("sep", OPEN, [{ date: "2026-09-10", desc: "IBFT BINTANG STATIONERY", debit: 87500 }], { month: "2026-09" });
    const b = stmt("oct", OPEN, [{ date: "2026-10-10", desc: "IBFT BINTANG STATIONERY", debit: 87500 }], { month: "2026-10" });
    const docs = [bill("only", "Bintang Stationery", "", "2026-10-08", 875)];
    const r = run([a, b], docs);
    expect(r.results.get("oct:l1")!.state).toBe("matched"); // within 2 days of 10 Oct
    expect(r.results.get("sep:l1")!.state).not.toBe("matched"); // the same document cannot also pay September
    expect(r.consumed.has("only")).toBe(true);
  });
  it("is not used twice even when the earlier statement is processed first", () => {
    const a = stmt("sep", OPEN, [{ date: "2026-09-10", desc: "IBFT BINTANG STATIONERY", debit: 87500 }], { month: "2026-09" });
    const b = stmt("oct", OPEN, [{ date: "2026-09-12", desc: "IBFT BINTANG STATIONERY", debit: 87500 }], { month: "2026-10" });
    const r = run([a, b], [bill("only", "Bintang Stationery", "", "2026-09-11", 875)]);
    const matched = [r.results.get("sep:l1")!, r.results.get("oct:l1")!].filter((x) => x.state === "matched");
    expect(matched).toHaveLength(1);
  });
});

describe("which statements can be matched", () => {
  it("blocks a statement with a break", () => {
    const s = stmt("s1", OPEN, [{ date: "2026-10-05", desc: "X", debit: 100 }], { breakAt: 0 });
    const r = run([s], []);
    expect(r.summaries.get("s1")!.blocked).toBe("break");
    expect(r.results.size).toBe(0);
  });
  it("matches a totals-only statement and carries a warning flag", () => {
    const s = stmt("s1", OPEN, [{ date: "2026-10-05", desc: "BINTANG STATIONERY", debit: 91300 }], { balance: false });
    const r = run([s], [bill("b", "Bintang Stationery", "", "2026-10-05", 913)]);
    expect(r.results.get("s1:l1")!.state).toBe("matched");
    expect(r.summaries.get("s1")!.totalsOnly).toBe(true);
  });
});

describe("bank only, unexplained and money in", () => {
  const s = stmt("s1", OPEN, [
    { date: "2026-10-01", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1500 },
    { date: "2026-10-02", desc: "PAYROLL OCT 2026 STAFF SALARIES", debit: 1280000 },
    { date: "2026-10-03", desc: "PROFIT CREDIT PROFIT PAID", credit: 3980 },
    { date: "2026-10-04", desc: "INTER-BANK PAYMENT INTO A/C PELANGGAN MAJU INV SM-2210-003", credit: 520000 },
    { date: "2026-10-05", desc: "CASH DEPOSIT", credit: 10000 },
    { date: "2026-10-06", desc: "IBG PAYMENT ALI TRADING", debit: 240000 },
  ]);
  const r = run([s], []);
  const at = (n: number) => r.results.get(`s1:l${n}`)!;
  it("classifies charges, payroll and interest as bank only with proposed categories", () => {
    expect(at(1)).toMatchObject({ state: "bank-only", category: "Bank charges" });
    expect(at(2)).toMatchObject({ state: "bank-only", category: "Salaries and wages" });
    expect(at(3)).toMatchObject({ state: "bank-only", category: "Interest income" });
  });
  it("Sales receipts is only a proposal: never confirmed automatically", () => {
    expect(at(4)).toMatchObject({ state: "bank-only", category: "Sales receipts", categoryConfirmed: false });
    for (const n of [1, 2, 3, 4]) expect(at(n).categoryConfirmed).toBe(false);
  });
  it("a receipt with no invoice reference and a payment with no document are unexplained", () => {
    expect(at(5).state).toBe("unexplained");
    expect(at(6).state).toBe("unexplained");
  });
  it("money in is never matched to a bill", () => {
    const rr = run([stmt("s1", OPEN, [{ date: "2026-10-04", desc: "PELANGGAN INV SM-2210-003", credit: 91300 }])], [bill("b", "Pelanggan", "SM-2210-003", "2026-10-04", 913)]);
    expect(rr.results.get("s1:l1")!.billIds).toEqual([]);
  });
});

describe("Reconciled", () => {
  const s = stmt("s1", OPEN, [
    { date: "2026-10-05", desc: "BINTANG STATIONERY", debit: 91300 },
    { date: "2026-10-19", desc: "SERVICE CHARGE", debit: 1500 },
  ]);
  const docs = [bill("b", "Bintang Stationery", "", "2026-10-05", 913)];
  it("needs bank only categories confirmed by a person, and says how many", () => {
    const r = run([s], docs);
    const sum = r.summaries.get("s1")!;
    expect(sum.reconciled).toBe(false);
    expect(sum.bankOnlyToConfirm).toBe(1);
    expect(sum.outstanding).toContain("1 bank only line to confirm");
  });
  it("is reconciled once a person confirms", () => {
    const decisions = markBankOnly({}, "s1:l2", "Bank charges", "NONE");
    const r = run([s], docs, { decisions });
    expect(r.summaries.get("s1")!.reconciled).toBe(true);
    expect(r.summaries.get("s1")!.bankOnlyToConfirm).toBe(0);
  });
  it("is not reconciled while anything is suggested or unexplained", () => {
    const sugg = stmt("s1", OPEN, [{ date: "2026-10-25", desc: "BINTANG STATIONERY", debit: 91300 }]);
    const r = run([sugg], [bill("b", "Bintang Stationery", "", "2026-10-01", 913)]);
    expect(r.results.get("s1:l1")!.state).toBe("suggested");
    expect(r.summaries.get("s1")!.reconciled).toBe(false);
    expect(run([stmt("s1", OPEN, [{ date: "2026-10-25", desc: "MYSTERY", debit: 100 }])], []).summaries.get("s1")!.reconciled).toBe(false);
  });
  it("accepting a suggestion makes it matched; rejecting stops it being suggested again", () => {
    const sugg = stmt("s1", OPEN, [{ date: "2026-10-25", desc: "BINTANG STATIONERY", debit: 91300 }]);
    const docs2 = [bill("b", "Bintang Stationery", "", "2026-10-01", 913, { account: "Office supplies" })];
    const first = run([sugg], docs2).results.get("s1:l1")!;
    expect(first.category).toBe("Office supplies"); // arrives with a proposed category and tax code
    const accepted = run([sugg], docs2, { decisions: acceptSuggestion({}, first, first.category, first.taxCode, "Aisyah Rahman", "2026-11-13T02:00:00Z") });
    expect(accepted.results.get("s1:l1")!.state).toBe("matched");
    expect(accepted.results.get("s1:l1")!.rule).toBe("accepted");
    // an accepted suggestion stays visibly different from a rule match, and remembers where it came from
    expect(accepted.results.get("s1:l1")!.accepted).toEqual({ by: "Aisyah Rahman", at: "2026-11-13T02:00:00Z", origin: first.ruleLabel });
    expect(accepted.results.get("s1:l1")!.ruleLabel).toBe("Accepted by you");
    expect(first.ruleLabel).toContain("Suggested");
    const rejected = run([sugg], docs2, { decisions: rejectSuggestion({}, first) });
    expect(rejected.results.get("s1:l1")!.state).toBe("unexplained");
  });
  it("a person can link a document to an unexplained line", () => {
    const x = stmt("s1", OPEN, [{ date: "2026-10-25", desc: "MYSTERY", debit: 91300 }]);
    const r = run([x], [bill("b", "Anyone", "", "2026-01-01", 913)], { decisions: linkDocument({}, "s1:l1", "b", "Office supplies", "NONE", "Aisyah Rahman") });
    expect(r.results.get("s1:l1")).toMatchObject({ state: "matched", rule: "linked", billIds: ["b"] });
    expect(r.results.get("s1:l1")!.accepted?.by).toBe("Aisyah Rahman");
  });
});

describe("proposed tax code is date aware", () => {
  it("warns when the code was not in force on the payment date", () => {
    const s = stmt("s1", OPEN, [{ date: "2023-06-10", desc: "KILAT BROADBAND", debit: 21492 }], { month: "2023-06" });
    const r = run([s], [bill("b", "Kilat Broadband", "", "2023-06-10", 214.92, { taxCode: "SVC8" })]);
    expect(r.results.get("s1:l1")!.taxWarning).toContain("was not in force");
  });
});

describe("payee memory", () => {
  const sep = stmt("sep", OPEN, [{ date: "2026-09-10", desc: "IBFT TRANSFER BINTANG STATIONERY CASH BILL 5531", debit: 87500 }], { month: "2026-09" });
  const oct = stmt("oct", OPEN, [{ date: "2026-10-10", desc: "IBFT TRANSFER BINTANG STATIONERY", debit: 91300 }], { month: "2026-10" });
  const docs = [bill("o", "Bintang Stationery", "", "2026-10-10", 913, { account: "Office supplies" })];

  it("counts how many other lines would change, and applies it to past lines when approved", () => {
    const base = run([sep, oct], docs);
    const target = base.results.get("oct:l1")!;
    const plan = planAnswer(base.results.values(), {}, target, "Computer and software", "NONE", "Bintang Stationery");
    expect(plan.others.map((o) => o.key)).toEqual(["sep:l1"]);
    const { decisions, memory } = recordAnswer({ decisions: {}, memory: {}, clientId: "c1", target, plan, applyToOthers: true });
    const after = run([sep, oct], docs, { decisions, memory: memory.c1 });
    expect(after.results.get("sep:l1")).toMatchObject({ category: "Computer and software", learned: true, categoryConfirmed: true });
    expect(after.results.get("oct:l1")).toMatchObject({ category: "Computer and software", categoryConfirmed: true });
  });
  it("applies to a future line from the remembered answer, but does not confirm it", () => {
    const base = run([oct], docs);
    const target = base.results.get("oct:l1")!;
    const plan = planAnswer(base.results.values(), {}, target, "Computer and software", "NONE", "Bintang Stationery");
    expect(plan.others).toHaveLength(0);
    const { memory } = recordAnswer({ decisions: {}, memory: {}, clientId: "c1", target, plan, applyToOthers: false });
    const later = run([oct, sep], docs, { memory: memory.c1 });
    const futureLine = later.results.get("sep:l1")!;
    expect(futureLine).toMatchObject({ category: "Computer and software", learned: true, categorySource: "memory", categoryConfirmed: false });
  });
  it("choosing only this line keeps other lines unchanged and remembers nothing", () => {
    const base = run([sep, oct], docs);
    const target = base.results.get("oct:l1")!;
    const plan = planAnswer(base.results.values(), {}, target, "Computer and software", "NONE", "Bintang Stationery");
    const out = recordAnswer({ decisions: {}, memory: {}, clientId: "c1", target, plan, applyToOthers: false });
    expect(out.memory).toEqual({});
    expect(run([sep, oct], docs, { decisions: out.decisions }).results.get("sep:l1")!.category).not.toBe("Computer and software");
  });
  it("never overwrites a line the person already answered", () => {
    const base = run([sep, oct], docs);
    const answered: Record<string, LineDecision> = { "sep:l1": { category: "Rent", taxCode: "NONE", categoryConfirmed: true, at: "x" } };
    const plan = planAnswer(base.results.values(), answered, base.results.get("oct:l1")!, "Computer and software", "NONE", "Bintang");
    expect(plan.others).toHaveLength(0);
  });
  it("is kept per client: another client's memory is not used", () => {
    const mem: PayeeMemory = { c2: { "BINTANG STATIONERY": { key: "BINTANG STATIONERY", payee: "x", category: "Rent", taxCode: "NONE", at: "x" } } };
    expect(run([oct], docs, { memory: mem.c1 }).results.get("oct:l1")!.learned).toBe(false);
    expect(findMemory(mem.c2, ["BINTANG", "STATIONERY", "MORE"])?.category).toBe("Rent");
  });
});

describe("model suggestions are suggestions only", () => {
  it("show as Suggested, never Matched, and never consume the document", () => {
    const s = stmt("s1", OPEN, [{ date: "2026-10-25", desc: "PAYMENT TO PELITA", debit: 75000 }]);
    const docs = [bill("a", "Pelita Cleaning", "", "2026-10-01", 300), bill("b", "Pelita Cleaning", "", "2026-10-02", 450)];
    const model: ModelSuggestion[] = [{ key: "s1:l1", billIds: ["a", "b"], kind: "many-invoices", reason: "two invoices", category: "General expenses", taxCode: "NONE" }];
    const r = run([s], docs, { model });
    expect(r.results.get("s1:l1")).toMatchObject({ state: "suggested", suggestSource: "model" });
    expect(r.consumed.size).toBe(0);
  });
});
