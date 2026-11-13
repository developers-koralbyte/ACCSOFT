import { describe, expect, it } from "vitest";
import { extraDocumentsCost, firmQuote, PRICING } from "@/lib/pricing";
import { inviteAccountantUrl } from "@/lib/invite";
import { emailContactUrl, SITE, whatsappContactUrl } from "@/lib/site-config";
import { GUARANTEE, HEADLINE } from "@/lib/copy";

describe("firm pricing maths (integer sen)", () => {
  it("RM199 includes 10 active clients", () => {
    for (const n of [1, 5, 10]) expect(firmQuote(n).total).toBe(19900);
    expect(firmQuote(10).perClient).toBe(1990);
  });
  it("RM25 per active client from the 11th to the 50th", () => {
    expect(firmQuote(11).total).toBe(19900 + 2500);
    expect(firmQuote(25).total).toBe(19900 + 15 * 2500);
    expect(firmQuote(50).total).toBe(19900 + 40 * 2500); // RM1,199.00
  });
  it("RM20 per client from the 51st", () => {
    expect(firmQuote(51).total).toBe(19900 + 40 * 2500 + 2000);
    expect(firmQuote(60).total).toBe(139900); // RM1,399.00
    expect(firmQuote(100).total).toBe(19900 + 40 * 2500 + 50 * 2000);
  });
  it("gives the cost per client, rounded to the sen", () => {
    expect(firmQuote(60).perClient).toBe(2332); // 139900 / 60 = 2331.67
    expect(Number.isInteger(firmQuote(33).perClient)).toBe(true);
  });
  it("explains the total line by line and the lines add up", () => {
    const q = firmQuote(60);
    expect(q.lines.map((l) => [l.clients, l.rate])).toEqual([[10, 19900], [40, 2500], [10, 2000]]);
    expect(q.lines.reduce((a, l) => a + l.amount, 0)).toBe(q.total);
  });
  it("handles zero, negative, fractional and junk input", () => {
    expect(firmQuote(0)).toMatchObject({ total: 19900, perClient: null });
    expect(firmQuote(-5).activeClients).toBe(0);
    expect(firmQuote(10.9).activeClients).toBe(10);
    expect(firmQuote(Number.NaN).activeClients).toBe(0);
  });
  it("founding firm: 50% off after the free 60 days, for 12 months", () => {
    expect(PRICING).toMatchObject({ foundingFirms: 10, foundingFreeDays: 60, foundingDiscountPercent: 50, foundingDiscountMonths: 12 });
    expect(firmQuote(10).founding).toBe(9950);
    expect(firmQuote(11).founding).toBe(Math.round(22400 / 2));
  });
  it("per-client allowances and the other prices", () => {
    expect(PRICING).toMatchObject({ docsPerClient: 100, statementsPerClient: 4, extraDocument: 20, yearEndPack: 15000, businessFreeDocs: 30 });
  });
  it("extra documents are RM0.20 each beyond 100 per active client", () => {
    expect(extraDocumentsCost(10, 1000)).toEqual({ extra: 0, amount: 0 });
    expect(extraDocumentsCost(10, 1250)).toEqual({ extra: 250, amount: 5000 });
  });
});

describe("shared copy and contact config", () => {
  it("has the exact headline and guarantee", () => {
    expect(HEADLINE).toBe("Every client's month complete by the 5th, without chasing.");
    expect(GUARANTEE).toBe("If DocFlow cannot tie a statement to the cent or point to the exact line that breaks, that client's month is free.");
  });
  it("builds the WhatsApp and email links from the one config", () => {
    expect(whatsappContactUrl()).toBe(`https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(SITE.whatsappMessage)}`);
    expect(emailContactUrl()).toBe(`mailto:${SITE.email}?subject=${encodeURIComponent(SITE.emailSubject)}`);
  });
  it("the invite link is a prefilled WhatsApp message with no number", () => {
    const url = inviteAccountantUrl("https://example.vercel.app");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("https://example.vercel.app");
  });
  it("uses no em or en dashes", () => {
    expect(HEADLINE + GUARANTEE + SITE.whatsappMessage + SITE.emailSubject).not.toMatch(/[–—]/);
  });
});
