"use client";

import Link from "next/link";
import { useState } from "react";
import { GUARANTEE } from "@/lib/copy";
import { fmtRM, fmtRMShort } from "@/lib/money";
import { firmQuote, PRICING } from "@/lib/pricing";
import { emailContactUrl, SITE, whatsappConfigured, whatsappContactUrl } from "@/lib/site-config";

export default function PricingPage() {
  const [clients, setClients] = useState("12");
  const n = Number(clients);
  const q = firmQuote(n);
  const p = PRICING;

  return (
    <main>
      <section className="hero compact">
        <div className="wrap">
          <h1>Simple pricing for accounting firms</h1>
          <p className="lead">You pay for active clients. Prices are in Malaysian ringgit.</p>
        </div>
      </section>

      <section className="wrap">
        <div className="plans">
          <div className="card plan main">
            <h2>Firm</h2>
            <div className="price">{fmtRMShort(p.firmBase)}<span> per month</span></div>
            <ul>
              <li>Includes {p.includedClients} active clients</li>
              <li>Then {fmtRMShort(p.midRate)} per active client per month</li>
              <li>{fmtRMShort(p.highRate)} per active client from the {p.midUpTo + 1}st</li>
              <li>Each client includes {p.docsPerClient} documents and {p.statementsPerClient} bank statements a month</li>
              <li>Extra documents {fmtRMShort(p.extraDocument)} each</li>
            </ul>
          </div>
          <div className="card plan">
            <h2>Year-end catch-up pack</h2>
            <div className="price">{fmtRMShort(p.yearEndPack)}<span> per company, one-off</span></div>
            <ul>
              <li>Up to twelve statements for one account in one go</li>
              <li>Proof and continuity across the year</li>
              <li>One bundle of audit packs for every approved month</li>
            </ul>
          </div>
          <div className="card plan">
            <h2>Business (self-serve)</h2>
            <div className="price">Free<span> up to {p.businessFreeDocs} documents a month</span></div>
            <ul>
              <li>For a business keeping its own documents</li>
              <li>Invite your accountant by WhatsApp</li>
            </ul>
          </div>
        </div>

        <div className="card definition">
          <strong>What is an active client?</strong> An active client is one that sends at least one document or statement in the month. A client that sends nothing that month costs nothing extra.
        </div>

        <div className="card founding">
          <strong>Founding firm offer</strong>
          <p style={{ margin: "4px 0 0" }}>
            The first {p.foundingFirms} firms get {p.foundingFreeDays} days free, then {p.foundingDiscountPercent}% off for {p.foundingDiscountMonths} months.
          </p>
        </div>

        <div className="card calc">
          <h2 style={{ margin: "0 0 4px" }}>Calculator</h2>
          <p className="sub" style={{ margin: "0 0 12px" }}>Enter the number of active clients in a month.</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <div>
              <label htmlFor="active">Active clients</label>
              <input id="active" inputMode="numeric" value={clients} onChange={(e) => setClients(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} />
            </div>
          </div>
          <div className="calc-out">
            <div><div className="big" data-testid="monthly-total">{fmtRM(q.total)}</div><div className="l">per month</div></div>
            <div><div className="big" data-testid="per-client">{q.perClient === null ? "n/a" : fmtRM(q.perClient)}</div><div className="l">per active client</div></div>
            <div><div className="big">{fmtRM(q.founding)}</div><div className="l">per month with the founding offer, after the free {p.foundingFreeDays} days</div></div>
          </div>
          <table className="calc-lines">
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
          <p className="fine">Extra documents beyond {p.docsPerClient} per active client are {fmtRMShort(p.extraDocument)} each and are not included above. Taxes are not included.</p>
        </div>

        <div className="card guarantee-card">
          <strong>Our guarantee</strong>
          <p>{GUARANTEE}</p>
        </div>

        <div className="card contact" id="contact">
          <div>
            <h2 style={{ margin: 0 }}>Ready to try it?</h2>
            <p className="sub" style={{ margin: "4px 0 0" }}>Send us one bank statement and we will show you the result.</p>
          </div>
          <div className="cta-row" style={{ margin: 0 }}>
            {whatsappConfigured() && <a className="btn" href={whatsappContactUrl()} target="_blank" rel="noopener noreferrer">WhatsApp us</a>}
            <a className="btn" href={emailContactUrl()}>Email {SITE.email}</a>
            <Link className="btn secondary" href="/board">Open the demo</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
