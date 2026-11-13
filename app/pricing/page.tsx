"use client";

import Link from "next/link";
import { useState } from "react";
import { GUARANTEE } from "@/lib/copy";
import { fmtRM, fmtRMShort } from "@/lib/money";
import { firmQuote, PRICING } from "@/lib/pricing";
import { emailContactUrl, SITE } from "@/lib/site-config";
import { CtaRow, PublicFooter, Tick } from "../public-parts";

export default function PricingPage() {
  const [clients, setClients] = useState("12");
  const q = firmQuote(Number(clients));
  const p = PRICING;

  return (
    <main className="pub">
      <section className="p-band hero-band">
        <div className="p-wrap p-band-in center">
          <p className="p-band-eyebrow">Pricing</p>
          <h1>Simple pricing for accounting firms</h1>
          <p className="p-band-sub">You pay for active clients. Prices are in Malaysian ringgit and do not include tax.</p>
        </div>
      </section>

      <section className="p-sec tight">
        <div className="p-wrap">
          <div className="p-prices">
            <div className="p-price-card featured">
              <h2>Firm</h2>
              <div className="p-price">{fmtRMShort(p.firmBase)}<span> per month</span></div>
              <ul className="p-checks">
                <li><Tick />Includes {p.includedClients} active clients</li>
                <li><Tick />Then {fmtRMShort(p.midRate)} per active client per month</li>
                <li><Tick />{fmtRMShort(p.highRate)} per active client from the {p.midUpTo + 1}st</li>
                <li><Tick />Each client includes {p.docsPerClient} documents and {p.statementsPerClient} bank statements a month</li>
                <li><Tick />Extra documents {fmtRMShort(p.extraDocument)} each</li>
              </ul>
            </div>
            <div className="p-price-card">
              <h2>Year-end catch-up pack</h2>
              <div className="p-price">{fmtRMShort(p.yearEndPack)}<span> per company, one-off</span></div>
              <ul className="p-checks">
                <li><Tick />Up to twelve statements for one account in one go</li>
                <li><Tick />Proof and continuity across the year</li>
                <li><Tick />One bundle of audit packs for every approved month</li>
              </ul>
            </div>
            <div className="p-price-card">
              <h2>Business (self-serve)</h2>
              <div className="p-price">Free<span> up to {p.businessFreeDocs} documents a month</span></div>
              <ul className="p-checks">
                <li><Tick />For a business keeping its own documents</li>
                <li><Tick />Invite your accountant by WhatsApp</li>
              </ul>
            </div>
          </div>

          <div className="p-notes">
            <div className="p-note">
              <strong>What is an active client?</strong>
              <p>An active client is one that sends at least one document or statement in the month. A client that sends nothing that month is not counted for that month.</p>
            </div>
            <div className="p-note accent">
              <strong>Founding firm offer</strong>
              <p>The first {p.foundingFirms} firms get {p.foundingFreeDays} days free, then {p.foundingDiscountPercent}% off for {p.foundingDiscountMonths} months.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="p-sec tint">
        <div className="p-wrap">
          <div className="p-calc">
            <div className="p-calc-in">
              <h2>Calculator</h2>
              <p className="p-calc-sub">Enter the number of active clients in a month.</p>
              <div className="p-field narrow">
                <label htmlFor="active">Active clients</label>
                <input id="active" inputMode="numeric" value={clients} onChange={(e) => setClients(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} />
              </div>
            </div>
            <div className="p-calc-out">
              <div className="p-calc-figs">
                <div><div className="p-big" data-testid="monthly-total">{fmtRM(q.total)}</div><div className="p-l">per month</div></div>
                <div><div className="p-big" data-testid="per-client">{q.perClient === null ? "n/a" : fmtRM(q.perClient)}</div><div className="p-l">per active client</div></div>
                <div><div className="p-big">{fmtRM(q.founding)}</div><div className="p-l">per month with the founding offer, after the free {p.foundingFreeDays} days</div></div>
              </div>
              <table className="p-calc-lines">
                <tbody>
                  {q.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.label}</td>
                      <td className="num">{i === 0 ? "" : `${l.clients} x ${fmtRM(l.rate)}`}</td>
                      <td className="num">{fmtRM(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-small">Extra documents beyond {p.docsPerClient} per active client are {fmtRMShort(p.extraDocument)} each and are not included above.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="p-band">
        <div className="p-wrap p-band-in">
          <p className="p-band-eyebrow">Our guarantee</p>
          <p className="p-band-text">{GUARANTEE}</p>
        </div>
      </section>

      <section className="p-band final">
        <div className="p-wrap p-band-in center">
          <h2>Ready to try it?</h2>
          <p>Open the demo on invented sample data, book a short walkthrough, or email <a href={emailContactUrl()}>{SITE.email}</a>.</p>
          <CtaRow light />
          <p className="p-small light"><Link href="/#faq">Read the FAQ</Link></p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
