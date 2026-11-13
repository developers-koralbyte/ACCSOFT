import { describe, expect, it } from "vitest";
import { validateModelSuggestions, buildModelRequest } from "@/lib/match/model";
import { bill } from "./helpers";

const lines = [
  { key: "s1:l1", date: "2026-10-25", description: "PAYMENT TO PELITA", debit: 75000 },
  { key: "s1:l2", date: "2026-10-26", description: "PAYMENT ON ACCOUNT", debit: 20000 },
];
const docs = [
  bill("a", "Pelita Cleaning", "", "2026-10-01", 300),
  bill("b", "Pelita Cleaning", "", "2026-10-02", 450),
  bill("c", "Wira Printing", "", "2026-10-03", 800),
  bill("d", "Pelita Cleaning", "", "2026-10-04", 999),
];

describe("model suggestion validator", () => {
  it("accepts one payment covering several invoices only when the sum is exact", () => {
    const ok = validateModelSuggestions([{ key: "s1:l1", billIds: ["a", "b"], kind: "many-invoices", reason: "r" }], lines, docs, new Set());
    expect(ok).toHaveLength(1);
    expect(ok[0].kind).toBe("many-invoices");
    const off = validateModelSuggestions([{ key: "s1:l1", billIds: ["a", "c"], kind: "many-invoices" }], lines, docs, new Set());
    expect(off).toHaveLength(0);
  });
  it("accepts an invoice paid in parts only when the invoice is larger than the payment", () => {
    const ok = validateModelSuggestions([{ key: "s1:l2", billIds: ["c"] }], lines, docs, new Set());
    expect(ok[0].kind).toBe("part-payment");
    expect(validateModelSuggestions([{ key: "s1:l1", billIds: ["a"] }], lines, docs, new Set())).toHaveLength(0); // 300 < 750: not a part payment of a, it is more than the bill
  });
  it("drops unknown lines, unknown documents, used documents and duplicates", () => {
    const raw = [
      { key: "nope", billIds: ["a"] },
      { key: "s1:l1", billIds: ["zzz"] },
      { key: "s1:l1", billIds: ["a", "b"] },
      { key: "s1:l1", billIds: ["a", "b"] }, // same line twice
      { key: "s1:l2", billIds: ["a"] }, // a already used above
    ];
    expect(validateModelSuggestions(raw, lines, docs, new Set())).toHaveLength(1);
    expect(validateModelSuggestions([{ key: "s1:l1", billIds: ["a", "b"] }], lines, docs, new Set(["a"]))).toHaveLength(0);
  });
  it("replaces an invalid category or a tax code that was not in force", () => {
    const [s] = validateModelSuggestions([{ key: "s1:l1", billIds: ["a", "b"], category: "Made up", taxCode: "NOPE" }], lines, docs, new Set());
    expect(s.category).toBe("General expenses");
    expect(s.taxCode).toBe("NONE");
  });
  it("sends amounts as integer sen", () => {
    const req = buildModelRequest(lines, docs);
    expect(req.documents[0].totalSen).toBe(30000);
    expect(req.lines[0].amountSen).toBe(75000);
  });
});
