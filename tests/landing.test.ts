import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FAQ, FEATURES, POINTS, SOFTWARE_OPTIONS } from "@/lib/landing-content";
import { validateWalkthrough, walkthroughEmail } from "@/lib/walkthrough";
import { SITE } from "@/lib/site-config";

const allCopy = () => JSON.stringify({ POINTS, FEATURES: FEATURES.map((f) => [f.title, f.text, f.alt]), FAQ, SOFTWARE_OPTIONS });

describe("landing copy", () => {
  it("has the seven feature rows in the agreed order", () => {
    expect(FEATURES.map((f) => f.id)).toEqual(["documents", "proof", "matching", "questions", "board", "signoff", "export"]);
    for (const f of FEATURES) {
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.text.length).toBeGreaterThan(40);
      expect(f.text.length).toBeLessThan(320); // a short explanation, not a paragraph
      expect(f.img).toMatch(/^\/screens\/f-[a-z]+\.jpg$/);
      expect(fs.existsSync(path.join(__dirname, "../public", f.img))).toBe(true);
    }
  });

  it("has the seven FAQ questions in the agreed order", () => {
    expect(FAQ.map((f) => f.q)).toEqual([
      "Do my clients need to install an app?",
      "Which accounting software does it work with?",
      "What happens when the AI gets something wrong?",
      "Where is my data kept?",
      "Does it handle password-protected bank statements?",
      'How is "active client" counted for billing?',
      "Can I try it with my own bank statement?",
    ]);
    for (const f of FAQ) expect(f.a.join(" ").length).toBeGreaterThan(60);
  });

  it("is honest that live WhatsApp forwarding is not built yet, everywhere it is mentioned", () => {
    expect(POINTS[0].title).toBe("Collect documents from WhatsApp");
    expect(POINTS[0].text).toContain("in development");
    expect(FEATURES[0].text).toContain("in development");
    expect(FAQ[0].a.join(" ")).toContain("in development");
    const items = [...POINTS.map((p) => p.text), ...FEATURES.map((f) => f.text), ...FAQ.map((f) => f.a.join(" "))];
    for (const t of items.filter((x) => /forwarding|forward\b/i.test(x))) expect(t).toContain("in development");
  });

  it("answers where data is kept truthfully", () => {
    const a = FAQ[3].a.join(" ");
    expect(a).toContain("in your browser only");
    expect(a).toContain("in development");
    expect(a).toContain("does not exist yet");
  });

  it("says draft ledger templates are drafts, and that the translations are being checked", () => {
    expect(FAQ[1].a.join(" ")).toContain("draft export templates");
    expect(FEATURES[6].text).toContain("draft templates");
    expect(FEATURES[3].text).toContain("still being checked");
  });

  it("makes no invented claims: no testimonials, statistics, customer logos or time-saved claims", () => {
    const banned = /(testimonial|trusted by|customers? love|used by \d|save[sd]? (you |your )?(time|hours)|faster|hours? (saved|back)|\d+\s?%\s*(faster|more|less|reduction)|\d+x\b|award|#1|best-in-class)/i;
    expect(allCopy()).not.toMatch(banned);
  });

  it("uses no em or en dashes", () => {
    expect(allCopy()).not.toMatch(/[–—]/);
  });
});

describe("page structure", () => {
  const src = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
  it("builds the sections in the agreed order", () => {
    const marks = ["{/* 1. Hero */}", "{/* 2. Three supporting points */}", "{/* 3. Feature rows */}", "{/* 4. Guarantee */}", "{/* 5. Pricing summary */}", "{/* 6. Book a walkthrough */}", "{/* 7. FAQ */}", "{/* 8. Final call to action */}"];
    const at = marks.map((m) => src.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(src.indexOf("<PublicFooter")).toBeGreaterThan(at[7]);
  });
  it("repeats the demo and walkthrough buttons after the feature rows and after the FAQ", () => {
    const rows = src.indexOf("{/* 3. Feature rows */}");
    const guarantee = src.indexOf("{/* 4. Guarantee */}");
    expect(src.slice(rows, guarantee)).toContain("<CtaRow");
    const faq = src.indexOf("{/* 7. FAQ */}");
    expect(src.slice(faq)).toContain("<CtaRow");
  });
  it("has no WhatsApp contact buttons on the public pages", () => {
    for (const f of ["app/page.tsx", "app/pricing/page.tsx", "app/public-parts.tsx", "app/walkthrough-form.tsx"]) {
      const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      expect(code).not.toMatch(/wa\.me|whatsappContactUrl|WhatsApp us/);
    }
  });
});

describe("walkthrough form (no backend: builds an email)", () => {
  const ok = { name: "Aisha", firm: "Tan and Co", email: "aisha@example.com", whatsapp: "60 12 345 6789", clients: "35", software: "Xero" };
  it("needs a name and a valid email", () => {
    expect(validateWalkthrough(ok)).toEqual({});
    expect(validateWalkthrough({ ...ok, name: "" }).name).toBeTruthy();
    expect(validateWalkthrough({ ...ok, email: "" }).email).toBeTruthy();
    expect(validateWalkthrough({ ...ok, email: "not-an-email" }).email).toBeTruthy();
  });
  it("checks the optional fields only when they are filled in", () => {
    expect(validateWalkthrough({ ...ok, whatsapp: "", clients: "" })).toEqual({});
    expect(validateWalkthrough({ ...ok, whatsapp: "12" }).whatsapp).toBeTruthy();
    expect(validateWalkthrough({ ...ok, clients: "lots" }).clients).toBeTruthy();
  });
  it("opens an email to the address in site-config with every answer in it", () => {
    const m = walkthroughEmail(ok);
    expect(m.url.startsWith(`mailto:${SITE.email}?subject=`)).toBe(true);
    expect(SITE.email).toBe("alisyed@koralbyte.com");
    expect(m.subject).toContain("Tan and Co");
    for (const v of ["Aisha", "Tan and Co", "aisha@example.com", "60 12 345 6789", "35", "Xero"]) expect(m.body).toContain(v);
    expect(decodeURIComponent(m.url)).toContain("Number of clients: 35");
  });
  it("marks empty answers as not given", () => {
    expect(walkthroughEmail({ ...ok, whatsapp: "", software: "" }).body).toContain("WhatsApp number: (not given)");
  });
  it("offers the accounting software the app knows about", () => {
    expect(SOFTWARE_OPTIONS).toEqual(expect.arrayContaining(["Xero", "QuickBooks", "SQL Account", "AutoCount", "Zoho Books", "Other"]));
  });
});
