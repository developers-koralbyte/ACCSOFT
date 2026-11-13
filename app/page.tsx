import Link from "next/link";
import { HEADLINE, GUARANTEE } from "@/lib/copy";
import { emailContactUrl, SITE, whatsappContactUrl } from "@/lib/site-config";
import { StartGuidedDemoButton } from "./guided-demo";

export const metadata = { title: "DocFlow: every client's month complete by the 5th" };

const POINTS = [
  { title: "Clients just forward documents on WhatsApp", text: "Invoices, bills and receipts arrive where your clients already send them. Export a chat with its media and every document is read in one go." },
  { title: "Every bank statement is proven to the cent", text: "Opening balance plus money in, less money out, must equal the closing balance, and every running balance must agree line by line. A break is pointed to the exact line." },
  { title: "Works with the ledger you already use", text: "Export approved bank lines for Xero or QuickBooks today. SQL Account, AutoCount and Zoho Books are in draft until their templates are checked. Xero draft bill posting is built in." },
];

const STEPS = [
  { n: 1, title: "Documents arrive", text: "Clients forward photos and PDFs on WhatsApp. DocFlow reads each one and lists them for review, with warnings for mismatched totals, duplicates and low confidence.", img: "/screens/documents.jpg", alt: "The review queue with documents read from WhatsApp" },
  { n: 2, title: "The statement is proven", text: "Upload a bank statement PDF. It is read in your browser and proven to the cent, with the exact line named if anything breaks.", img: "/screens/proof.jpg", alt: "A bank statement shown as proven to the cent" },
  { n: 3, title: "Lines are matched, and the rest are asked", text: "Bank lines are matched to documents by clear rules, and each rule is recorded. Payments nobody can explain become short questions to the client on WhatsApp.", img: "/screens/matching.jpg", alt: "Bank lines matched to documents, with the rule shown for each" },
  { n: 4, title: "The month is approved and exported", text: "A board shows every client's month at a glance. Two people sign off, the month locks, and you download the audit pack and your ledger file.", img: "/screens/board.jpg", alt: "The month board with a row for each client" },
];

export default function Landing() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <h1>{HEADLINE}</h1>
          <p className="lead">
            DocFlow gives accounting firms a finished month, not just a document reader: documents collected, bank statements proven, every line explained, and a month you can sign off and hand over.
          </p>
          <div className="cta-row">
            <Link className="btn big" href="/board">Open the demo</Link>
            <StartGuidedDemoButton className="btn big secondary" />
            <Link className="btn big secondary" href="/pricing">See pricing</Link>
          </div>
          <p className="fine">The demo runs on invented sample data, in your browser. Nothing is uploaded.</p>
        </div>
      </section>

      <section className="wrap">
        <div className="points">
          {POINTS.map((p) => (
            <div className="card point" key={p.title}>
              <h2>{p.title}</h2>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap" id="how">
        <h2 className="section-title">How it works</h2>
        <div className="steps-how">
          {STEPS.map((s) => (
            <div className="how" key={s.n}>
              <div className="how-text">
                <div className="how-n">Step {s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.img} alt={s.alt} loading="lazy" />
                <figcaption>A real screen from the demo, with sample data.</figcaption>
              </figure>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="card guarantee-card">
          <strong>Our guarantee</strong>
          <p>{GUARANTEE}</p>
        </div>
      </section>

      <section className="wrap" id="contact">
        <div className="card contact">
          <div>
            <h2 style={{ margin: 0 }}>Talk to us</h2>
            <p className="sub" style={{ margin: "4px 0 0" }}>Send us one bank statement and see it proven, matched and ready to export.</p>
          </div>
          <div className="cta-row" style={{ margin: 0 }}>
            <a className="btn" href={whatsappContactUrl()} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
            <a className="btn secondary" href={emailContactUrl()}>Email {SITE.email}</a>
          </div>
        </div>
      </section>

      <footer className="wrap site-foot">
        <span>{SITE.name} (working name)</span>
        <span><Link href="/pricing">Pricing</Link> | <Link href="/board">Open the demo</Link></span>
      </footer>
    </main>
  );
}
