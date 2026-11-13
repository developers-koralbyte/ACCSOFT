import { describe, expect, it } from "vitest";
import { buildMissingMessage, buildQuestionMessage, isDraft, LANGS, PACKS, questionSentence } from "@/lib/chase/templates";
import { whatsappUrl } from "@/lib/chase/send";
import { buildQuestions, openQuestions, payeeLabel } from "@/lib/chase/questions";
import { missingDocuments, receivedKinds, recurringKinds } from "@/lib/chase/missing";
import { reconcileClient } from "@/lib/match/engine";
import { answerWithDocument, answerWithText, planAnswer, recordAnswer } from "@/lib/match/actions";
import type { AppState } from "@/lib/types";
import { bill, stmt } from "./helpers";

const ali = { date: "2026-10-12", amount: 240000, side: "debit" as const, payee: "Ali Trading" };

describe("question wording", () => {
  it("matches the agreed English example exactly", () => {
    expect(questionSentence("en", ali)).toBe(
      "Hi, on 12/10/2026 RM2,400.00 was paid to Ali Trading. What was this for? You can reply with a photo of the bill or a short note.",
    );
  });
  it("groups several questions into ONE message, numbered", () => {
    const msg = buildQuestionMessage("en", "Seri Murni Trading Sdn Bhd", "2026-10", [ali, { date: "2026-10-02", amount: 450000, side: "debit", payee: "Harta Properti Rental Rent" }]);
    expect(msg.split("\n")).toHaveLength(4);
    expect(msg).toContain("2 questions about Seri Murni Trading Sdn Bhd for October 2026");
    expect(msg).toContain("1. On 12/10/2026, RM2,400.00 was paid to Ali Trading.");
    expect(msg).toContain("2. On 02/10/2026, RM4,500.00");
  });
  it("uses 'received from' for money in", () => {
    expect(questionSentence("en", { ...ali, side: "credit", payee: "Someone" })).toContain("was received from Someone");
  });
  it("has all three languages, with the same facts in each", () => {
    for (const lang of LANGS) {
      const m = buildQuestionMessage(lang, "Client", "2026-10", [ali, ali]);
      expect(m).toContain("RM2,400.00");
      expect(m).toContain("12/10/2026");
      expect(m).toContain("Ali Trading");
    }
    expect(buildQuestionMessage("ms", "C", "2026-10", [ali, ali])).toContain("Oktober 2026");
    expect(buildQuestionMessage("zh", "C", "2026-10", [ali, ali])).toContain("2026年10月");
  });
  it("marks Bahasa Malaysia and Mandarin as drafts, not English", () => {
    expect(isDraft("en")).toBe(false);
    expect(isDraft("ms")).toBe(true);
    expect(isDraft("zh")).toBe(true);
    expect(PACKS.ms.label).toBe("Bahasa Malaysia");
  });
  it("builds the missing-documents message in the client's language", () => {
    expect(buildMissingMessage("en", "Seri Murni", "2026-10", ["Rent", "Bank statement"])).toBe(
      "Hi, to finish October 2026 for Seri Murni we are still missing:\n- Rent receipt or invoice\n- Bank statement\nPlease send photos or PDFs here on WhatsApp. Thank you!",
    );
    expect(buildMissingMessage("ms", "X", "2026-10", ["Rent"])).toContain("Resit atau invois sewa");
    expect(buildMissingMessage("zh", "X", "2026-10", ["Bank statement"])).toContain("银行对账单");
    expect(buildMissingMessage("en", "X", "2026-10", [])).toBe("");
  });
  it("never uses em or en dashes in any client text", () => {
    const all = JSON.stringify(PACKS.en.kinds) + JSON.stringify(PACKS.ms.kinds) + JSON.stringify(PACKS.zh.kinds);
    for (const lang of LANGS) {
      const text = buildQuestionMessage(lang, "C", "2026-10", [ali, ali]) + buildMissingMessage(lang, "C", "2026-10", ["Rent"]) + all;
      expect(text).not.toMatch(/[–—]/);
    }
  });
});

describe("WhatsApp link", () => {
  it("builds a wa.me link with the text prefilled", () => {
    expect(whatsappUrl("+60 10-000 0001", "Hi & bye")).toBe("https://wa.me/60100000001?text=Hi%20%26%20bye");
  });
});

describe("questions from unexplained lines", () => {
  const OPEN = 5_000_000;
  const s = stmt("s1", OPEN, [
    { date: "2026-10-02", desc: "TRANSFER TO A/C HARTA PROPERTI RENTAL RENT OCT 2026", debit: 450000 },
    { date: "2026-10-12", desc: "IBG PAYMENT ALI TRADING", debit: 240000 },
    { date: "2026-10-19", desc: "SERVICE CHARGE MONTHLY ACCOUNT FEE", debit: 1500 },
  ]);
  const run = (decisions = {}, bills: ReturnType<typeof bill>[] = []) => reconcileClient({ statements: [s], bills, decisions, memory: {} });

  it("derives one question per Unexplained line, Not sent at first", () => {
    const qs = buildQuestions({ statements: [s], recon: run(), sent: {} });
    expect(qs.map((q) => q.payee)).toEqual(["Harta Properti Rental Rent", "Ali Trading"]);
    expect(qs.every((q) => q.status === "not-sent")).toBe(true);
    expect(qs[1]).toMatchObject({ amount: 240000, side: "debit", date: "2026-10-12", month: "2026-10" });
  });
  it("shows Sent with the date once sent", () => {
    const qs = buildQuestions({ statements: [s], recon: run(), sent: { "s1:l2": { key: "s1:l2", sentAt: "2026-11-13T01:00:00Z", sentBy: "Aisyah Rahman" } } });
    const q = qs.find((x) => x.key === "s1:l2")!;
    expect(q).toMatchObject({ status: "sent", sentAt: "2026-11-13T01:00:00Z" });
    expect(openQuestions(qs)).toHaveLength(2); // sent but unanswered is still open
  });
  it("a text answer moves the line to Answered, keeps the answer and counts as explained", () => {
    const decisions = answerWithText({}, "s1:l2", "Paid for repairs", "Repairs and maintenance", "NONE", "Aisyah Rahman", "2026-11-14T03:00:00Z");
    const r = run(decisions);
    const line = r.results.get("s1:l2")!;
    expect(line.state).toBe("answered");
    expect(line.answer).toEqual({ text: "Paid for repairs", by: "Aisyah Rahman", at: "2026-11-14T03:00:00Z" });
    expect(line).toMatchObject({ category: "Repairs and maintenance", categoryConfirmed: true });
    const sum = r.summaries.get("s1")!;
    expect(sum.counts.answered).toBe(1);
    expect(sum.counts.unexplained).toBe(1); // rent is still open
    expect(openQuestions(buildQuestions({ statements: [s], recon: r, sent: {} }))).toHaveLength(1);
  });
  it("Reconciled once everything is answered or confirmed", () => {
    let d = answerWithText({}, "s1:l1", "Rent for the shop", "Rent", "NONE", "A", "x");
    d = answerWithText(d, "s1:l2", "Repairs", "Repairs and maintenance", "NONE", "A", "x");
    expect(run(d).summaries.get("s1")!.reconciled).toBe(false); // the service charge category is still to be confirmed
    d = { ...d, "s1:l3": { bankOnly: true, category: "Bank charges", taxCode: "NONE", categoryConfirmed: true, at: "x" } };
    expect(run(d).summaries.get("s1")!.reconciled).toBe(true);
  });
  it("an answer with a document links it, and category and tax code come from that document", () => {
    const doc = bill("d1", "Ali Trading", "AT-1", "2026-10-10", 2400, { account: "Repairs and maintenance", taxCode: "SVC8" });
    const r = run(answerWithDocument({}, "s1:l2", "d1", "Here is the invoice", "Aisyah Rahman", "2026-11-14T03:00:00Z"), [doc]);
    const line = r.results.get("s1:l2")!;
    expect(line).toMatchObject({ state: "answered", billIds: ["d1"], category: "Repairs and maintenance", taxCode: "SVC8", categoryConfirmed: true });
    expect(line.answer?.text).toBe("Here is the invoice");
    expect(r.consumed.has("d1")).toBe(true);
  });
  it("document taken from the answer is not matched to another line", () => {
    const doc = bill("d1", "Ali Trading", "AT-1", "2026-10-10", 2400);
    const r = run(answerWithDocument({}, "s1:l2", "d1", undefined, "A"), [doc]);
    expect(r.results.get("s1:l1")!.billIds).toEqual([]);
  });
  it("a text answer feeds payee memory as usual", () => {
    const decisions = answerWithText({}, "s1:l2", "Repairs", "Repairs and maintenance", "NONE", "A");
    const r = run(decisions);
    const plan = planAnswer(r.results.values(), decisions, r.results.get("s1:l2")!, "Repairs and maintenance", "NONE", "Ali Trading");
    const out = recordAnswer({ decisions, memory: {}, clientId: "c1", target: r.results.get("s1:l2")!, plan, applyToOthers: false });
    expect(out.memory.c1["ALI TRADING"].category).toBe("Repairs and maintenance");
  });
  it("labels payees readably", () => {
    expect(payeeLabel("IBG PAYMENT ALI TRADING")).toBe("Ali Trading");
    expect(payeeLabel("CASH 5519")).toBe("someone (see the bank statement)");
  });
});

describe("missing documents chaser", () => {
  const empty = (): AppState => ({ clients: [], bills: [], statements: [], decisions: {}, memory: {}, modelSuggestions: [], questions: {}, history: [], chases: {}, months: {}, activity: [] });
  const base = (): AppState => {
    const s = empty();
    for (const m of ["2026-07", "2026-08", "2026-09"]) {
      for (const kind of ["Rent", "Utilities", "Bank statement"]) s.history.push({ clientId: "c1", month: m, kind, label: kind });
    }
    s.history.push({ clientId: "c1", month: "2026-10", kind: "Utilities", label: "Utilities" });
    return s;
  };
  it("finds recurring kinds from earlier months", () => {
    expect(recurringKinds(base(), "c1", "2026-10").map((k) => k.kind)).toEqual(["Rent", "Utilities", "Bank statement"]);
  });
  it("lists what has not arrived for the month", () => {
    expect(missingDocuments(base(), "c1", "2026-10").map((k) => k.kind)).toEqual(["Rent", "Bank statement"]);
  });
  it("needs a category in at least 2 of the previous 3 months", () => {
    const s = empty();
    s.history.push({ clientId: "c1", month: "2026-09", kind: "Rent", label: "" });
    expect(missingDocuments(s, "c1", "2026-10")).toEqual([]);
    s.history.push({ clientId: "c1", month: "2026-08", kind: "Rent", label: "" });
    expect(missingDocuments(s, "c1", "2026-10").map((k) => k.kind)).toEqual(["Rent"]);
  });
  it("a loaded statement for the month satisfies Bank statement", () => {
    const s = base();
    s.statements.push(stmt("oct", 1000, [{ date: "2026-10-05", desc: "X", debit: 100 }]));
    expect(receivedKinds(s, "c1", "2026-10").has("Bank statement")).toBe(true);
    expect(missingDocuments(s, "c1", "2026-10").map((k) => k.kind)).toEqual(["Rent"]);
  });
  it("a document in a recurring category dated in the month satisfies it", () => {
    const s = base();
    s.bills.push(bill("r", "Landlord", "R-1", "2026-10-02", 4500, { account: "Rent" }));
    expect(missingDocuments(s, "c1", "2026-10").map((k) => k.kind)).toEqual(["Bank statement"]);
  });
  it("'Not needed this month' removes an item", () => {
    const s = base();
    s.months["c1:2026-10"] = { clientId: "c1", month: "2026-10", waived: ["Rent"], ackTotalsOnly: [], history: [] };
    expect(missingDocuments(s, "c1", "2026-10").map((k) => k.kind)).toEqual(["Bank statement"]);
  });
  it("is per client", () => {
    expect(missingDocuments(base(), "c2", "2026-10")).toEqual([]);
  });
});
