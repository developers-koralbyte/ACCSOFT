import Link from "next/link";
import { SITE, emailContactUrl } from "@/lib/site-config";

export function Tick() {
  return (
    <svg className="p-tick" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.14" />
      <path d="M5.5 10.4l3 3 6-6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// "Open the demo" and "Book a walkthrough", with the honest sample data line next to them.
export function CtaRow({ light = false }: { light?: boolean }) {
  return (
    <div className={`p-cta-block${light ? " light" : ""}`}>
      <div className="p-cta">
        <Link className={`p-btn lg ${light ? "white" : "primary"}`} href="/board">Open the demo</Link>
        <Link className={`p-btn lg ${light ? "outline-light" : "secondary"}`} href="/#walkthrough">Book a walkthrough</Link>
      </div>
      <p className="p-fine"><span className="p-dot" aria-hidden="true" /> Demo: sample data. Everything in the demo is invented and stays in your browser.</p>
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="p-footer">
      <div className="p-wrap p-footer-in">
        <div>
          <div className="pub-brand"><span className="pub-mark" aria-hidden="true" />{SITE.name}</div>
          <p>{SITE.workingName ? `${SITE.name} is a working name.` : ""} A working demo on invented sample data.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/#how">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/board">Open the demo</Link>
          <a href={emailContactUrl()}>{SITE.email}</a>
        </nav>
      </div>
    </footer>
  );
}
