import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { seedState } from "@/lib/demo";
import { fyEndYearOf, fyOptions, fyRange, yearEndPackFiles, yearEndPackZip, yearEndView } from "@/lib/export/yearend";

const NOW = new Date("2026-11-13T05:00:00Z");
const AT = "2026-11-20T03:00:00Z";

describe("financial year", () => {
  it("is 12 months ending at the year end month", () => {
    const fy = fyRange(12, 2026);
    expect(fy.months[0]).toBe("2026-01");
    expect(fy.months[11]).toBe("2026-12");
    const june = fyRange(6, 2027);
    expect(june.months[0]).toBe("2026-07");
    expect(june.months[11]).toBe("2027-06");
  });
  it("puts a month in the right year", () => {
    expect(fyEndYearOf("2026-10", 12)).toBe(2026);
    expect(fyEndYearOf("2026-10", 6)).toBe(2027);
    expect(fyEndYearOf("2026-06", 6)).toBe(2026);
  });
  it("offers the years a client has statements in, using the client's year end", () => {
    const s = seedState();
    expect(fyOptions(s, "c3")).toEqual([2027]); // BlueRiver has a June year end
    expect(fyOptions(s, "c4")).toEqual([2026]);
  });
});

describe("year-end view", () => {
  const s = seedState();
  it("counts months proven, missing and breaks per account", () => {
    const v = yearEndView(s, "c3", fyRange(6, 2027), NOW);
    expect(v.accounts).toHaveLength(1);
    const a = v.accounts[0];
    expect(a.provenCount).toBe(1);
    expect(a.breakCount).toBe(0);
    expect(a.reconciledCount).toBe(1);
    expect(a.missing).toEqual(["2026-07", "2026-08", "2026-09"]); // due, no statement; Nov onward is not due yet
    expect(a.months.find((m) => m.month === "2026-11")).toMatchObject({ hasStatement: false, due: false, proofLabel: "Not due yet" });
    expect(v.approvedMonths).toEqual(["2026-10"]);
  });
  it("lists the months not yet approved, with the reason", () => {
    const v = yearEndView(s, "c5", fyRange(12, 2026), NOW);
    expect(v.approvedMonths).toEqual([]);
    expect(v.notApproved.find((n) => n.month === "2026-10")?.reason).toBe("Prepared by Aisyah Rahman, awaiting review");
    expect(v.notApproved.find((n) => n.month === "2026-01")?.reason).toBe("No statement has arrived");
  });
  it("counts a break", () => {
    const broken = { ...s, statements: s.statements.map((x) => (x.id === "seed-c4-oct" ? { ...x, lines: x.lines.map((l, i) => (i === 1 ? { ...l, debit: l.debit + 100 } : l)) } : x)) };
    expect(yearEndView(broken, "c4", fyRange(12, 2026), NOW).accounts[0].breakCount).toBe(1);
  });
});

describe("year-end pack", () => {
  const s = seedState();
  const input = { state: s, clientId: "c3", fy: fyRange(6, 2027), now: NOW, generatedAt: AT, pdfsByStatement: {} };
  it("bundles the audit pack of every approved month in a folder", () => {
    const files = yearEndPackFiles(input);
    expect(Object.keys(files)).toContain("2026-10/reconciliation-statement.html");
    expect(Object.keys(files)).toContain("2026-10/line-by-line.csv");
    expect(Object.keys(files)).toContain("year-end-summary.html");
    expect(Object.keys(files)).toContain("year-end-summary.csv");
  });
  it("lists the months not yet approved", () => {
    const html = strFromU8(yearEndPackFiles(input)["year-end-summary.html"]);
    expect(html).toContain("Months not yet approved");
    expect(html).toContain("July 2026: No statement has arrived");
    expect(html).toContain("Approved months included in this pack: <strong>1</strong>");
  });
  it("is one ZIP, and has no audit folders when nothing is approved", () => {
    expect(Object.keys(unzipSync(yearEndPackZip(input))).length).toBeGreaterThan(5);
    const none = Object.keys(yearEndPackFiles({ ...input, clientId: "c5", fy: fyRange(12, 2026) }));
    expect(none.filter((n) => n.includes("/"))).toEqual([]);
    expect(none).toContain("year-end-summary.html");
  });
});
