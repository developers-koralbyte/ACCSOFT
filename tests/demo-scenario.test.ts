import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingestPdf } from "@/lib/statements/ingest";
import { reconcileClient } from "@/lib/match/engine";
import { seedState, seedBusinessState, clearSamples } from "@/lib/demo";
import { toSen } from "@/lib/money";
import type { Statement } from "@/lib/statements/types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

async function load(id: string, file: string): Promise<Statement> {
  const data = new Uint8Array(fs.readFileSync(path.join(__dirname, "../public/samples", file)));
  const r = await ingestPdf(data, { pdfjs, liveAvailable: false });
  if (r.kind !== "statement") throw new Error("not read");
  return { ...r.draft, id, clientId: "c1", fileName: file, kind: "sample", addedAt: "x" };
}

describe("the sample demo shows all four states", () => {
  it("October for Seri Murni Trading", async () => {
    const sep = await load("sep", "bank-a-sep-2026.pdf");
    const oct = await load("oct", "bank-a-oct-2026.pdf");
    const bills = seedState().bills.filter((b) => b.clientId === "c1");
    const r = reconcileClient({ statements: [sep, oct], bills, decisions: {}, memory: {} });

    const o = r.summaries.get("oct")!;
    expect(o.counts).toEqual({ matched: 5, suggested: 1, "bank-only": 7, unexplained: 2, answered: 0 });
    const rules = oct.lines.map((l) => r.results.get(`oct:${l.id}`)!).filter((x) => x.state === "matched").map((x) => x.rule);
    expect(rules.sort()).toEqual(["payee-7d", "reference", "reference", "reference", "single-3d"]);
    expect(o.reconciled).toBe(false);

    const s = r.summaries.get("sep")!;
    expect(s.counts).toEqual({ matched: 4, suggested: 1, "bank-only": 7, unexplained: 1, answered: 0 });
  });

  it("each document is used once across both months, and Cahaya Printing stays unpaid", async () => {
    const sep = await load("sep", "bank-a-sep-2026.pdf");
    const oct = await load("oct", "bank-a-oct-2026.pdf");
    const bills = seedState().bills.filter((b) => b.clientId === "c1");
    const r = reconcileClient({ statements: [sep, oct], bills, decisions: {}, memory: {} });
    const used = Array.from(r.results.values()).flatMap((x) => (x.state === "matched" ? x.billIds : []));
    expect(new Set(used).size).toBe(used.length);
    expect(r.consumed.has("b7")).toBe(false); // Cahaya Printing has no payment
  });

  it("the broadband and courier samples are services taxed at 8% and amounts are unchanged", () => {
    const bills = seedState().bills;
    for (const id of ["b3", "b5", "s3"]) expect(bills.find((b) => b.id === id)!.taxCode).toBe("SVC8");
    expect(toSen(bills.find((b) => b.id === "b3")!.total)).toBe(21492);
    expect(toSen(bills.find((b) => b.id === "b5")!.total)).toBe(64800);
    expect(bills.find((b) => b.id === "b3")!.description).not.toMatch(/broadband monthly|courier/i);
  });

  it("all seed data uses invented names", () => {
    const text = JSON.stringify(seedState().bills.map((b) => b.supplier)) + JSON.stringify(seedBusinessState().bills.map((b) => b.supplier));
    expect(text).not.toMatch(/Tenaga|Petronas|Shopee|Adobe|Grab|Unifi|Mr DIY|Microsoft/i);
  });
});

describe("business samples", () => {
  it("start with labelled samples and Clear samples removes only them", () => {
    const s = seedBusinessState();
    expect(s.bills.length).toBeGreaterThan(0);
    expect(s.bills.every((b) => b.sample)).toBe(true);
    const own = { ...s.bills[0], id: "mine", sample: undefined };
    const cleared = clearSamples({ ...s, bills: [...s.bills, own] });
    expect(cleared.bills.map((b) => b.id)).toEqual(["mine"]);
  });
});
