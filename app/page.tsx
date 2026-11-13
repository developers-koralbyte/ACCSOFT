import Link from "next/link";
import { HEADLINE, GUARANTEE } from "@/lib/copy";
import { FAQ, FEATURES, POINTS } from "@/lib/landing-content";
import { fmtRMShort } from "@/lib/money";
import { PRICING } from "@/lib/pricing";
import { SITE } from "@/lib/site-config";
import { StartGuidedDemoButton } from "./guided-demo";
import { Shot } from "./lightbox";
import { CtaRow, PublicFooter, Tick } from "./public-parts";
import WalkthroughForm from "./walkthrough-form";

export const metadata = { title: `${SITE.name}: every client's month complete by the 5th` };

export default function Landing() {
  const p = PRICING;
  return (
    <main className="pub">
      {/* 1. Hero */}
      <section className="p-hero">
        <div className="p-wrap p-hero-grid">
          <div className="p-hero-text">
            <p className="p-eyebrow">For accounting firms</p>
            <h1>{HEADLINE}</h1>
            <p className="p-lead">
              {SITE.name} gives your firm a finished month, not just a document reader: documents collected, bank statements proven to the cent, every line explained, and a month you can sign off and hand over.
            </p>
            <div className="p-cta">
              <Link className="p-btn primary lg" href="/board">Open the demo</Link>
              <StartGuidedDemoButton className="p-btn secondary lg" />
              <Link className="p-btn ghost lg" href="/pricing">See pricing</Link>
            </div>
            <p className="p-fine"><span className="p-dot" aria-hidden="true" /> Demo: sample data. Everything you see in the demo is invented, runs in your browser, and nothing is uploaded.</p>
          </div>
          <div className="p-shots">
            <figure className="p-frame p-frame-main">
              <div className="p-bar" aria-hidden="true"><i /><i /><i /></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screens/hero-board.jpg" alt="The month board: one row per client with five stages each" width="1280" height="640" />
            </figure>
            <figure className="p-frame p-frame-float">
              <div className="p-bar" aria-hidden="true"><i /><i /><i /></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screens/hero-proof.jpg" alt="A bank statement shown as proven to the cent, with the balance sums" width="940" height="420" />
            </figure>
          </div>
        </div>
      </section>

      {/* 2. Three supporting points */}
      <section className="p-sec p-points-sec">
        <div className="p-wrap p-points">
          {POINTS.map((pt) => (
            <div className="p-card" key={pt.title}>
              <Tick />
              <h2>{pt.title}</h2>
              <p>{pt.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Feature rows */}
      <section className="p-sec" id="how">
        <div className="p-wrap">
          <div className="p-sec-head">
            <p className="p-eyebrow">How it works</p>
            <h2>From a pile of documents to a signed-off month</h2>
            <p>Every screen below is a real screen from the demo, shown with invented sample data. Click a screen to enlarge it.</p>
          </div>
          <div className="p-rows">
            {FEATURES.map((f, i) => (
              <div className={`p-row${i % 2 === 1 ? " flip" : ""}`} key={f.id}>
                <div className="p-row-text">
                  <span className="p-row-n">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
                <div className="p-row-shot">
                  <Shot src={f.img} alt={f.alt} w={f.w} h={f.h} caption={`${f.title}. Sample data.`} />
                </div>
              </div>
            ))}
          </div>
          <CtaRow />
        </div>
      </section>

      {/* 4. Guarantee */}
      <section className="p-band">
        <div className="p-wrap p-band-in">
          <p className="p-band-eyebrow">Our guarantee</p>
          <p className="p-band-text">{GUARANTEE}</p>
        </div>
      </section>

      {/* 5. Pricing summary */}
      <section className="p-sec" id="pricing">
        <div className="p-wrap">
          <div className="p-sec-head center">
            <p className="p-eyebrow">Pricing</p>
            <h2>Simple pricing for accounting firms</h2>
            <p>You pay for active clients. An active client is one that sends at least one document or statement in the month.</p>
          </div>
          <div className="p-prices">
            <div className="p-price-card featured">
              <h3>Firm</h3>
              <div className="p-price">{fmtRMShort(p.firmBase)}<span> per month</span></div>
              <ul className="p-checks">
                <li><Tick />Includes {p.includedClients} active clients</li>
                <li><Tick />Then {fmtRMShort(p.midRate)} per active client per month, and {fmtRMShort(p.highRate)} from the {p.midUpTo + 1}st</li>
                <li><Tick />Each client includes {p.docsPerClient} documents and {p.statementsPerClient} bank statements a month</li>
              </ul>
            </div>
            <div className="p-price-card">
              <h3>Year-end catch-up pack</h3>
              <div className="p-price">{fmtRMShort(p.yearEndPack)}<span> per company, one-off</span></div>
              <ul className="p-checks">
                <li><Tick />Up to twelve statements for one account in one go</li>
                <li><Tick />Proof and continuity across the year</li>
              </ul>
            </div>
            <div className="p-price-card">
              <h3>Business (self-serve)</h3>
              <div className="p-price">Free<span> up to {p.businessFreeDocs} documents a month</span></div>
              <ul className="p-checks">
                <li><Tick />For a business keeping its own documents</li>
                <li><Tick />Invite your accountant by WhatsApp</li>
              </ul>
            </div>
          </div>
          <p className="p-price-foot">
            Founding firm offer: the first {p.foundingFirms} firms get {p.foundingFreeDays} days free, then {p.foundingDiscountPercent}% off for {p.foundingDiscountMonths} months.{" "}
            <Link href="/pricing">See the full pricing and the calculator</Link>
          </p>
        </div>
      </section>

      {/* 6. Book a walkthrough */}
      <section className="p-sec tint" id="walkthrough">
        <div className="p-wrap p-walk">
          <div className="p-walk-text">
            <p className="p-eyebrow">Book a 15-minute walkthrough</p>
            <h2>See it on your own kind of month</h2>
            <p>Tell us a little about your firm and we will walk you through the demo. You can also send us one bank statement and see it proven, matched and ready to export.</p>
          </div>
          <div className="p-walk-form">
            <WalkthroughForm />
          </div>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="p-sec" id="faq">
        <div className="p-wrap p-faq-wrap">
          <div className="p-sec-head center">
            <p className="p-eyebrow">FAQ</p>
            <h2>Straight answers</h2>
          </div>
          <div className="p-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="p-faq-a">{f.a.map((para, i) => <p key={i}>{para}</p>)}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Final call to action */}
      <section className="p-band final">
        <div className="p-wrap p-band-in center">
          <h2>Ready to see a finished month?</h2>
          <p>Open the demo and try it on invented sample data, or book a short walkthrough.</p>
          <CtaRow light />
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
