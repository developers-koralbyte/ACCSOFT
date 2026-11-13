"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DATA_EVENT, hasSampleData, readMode, resetDemoData, useStaff, writeMode, writeStaff, type Mode } from "@/lib/store";
import { STAFF } from "@/lib/staff";
import { SITE } from "@/lib/site-config";

interface Status {
  configured: boolean;
  connected: boolean;
  organisation: string | null;
}

export default function Nav() {
  const path = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>("firm");
  const [live, setLive] = useState<boolean | null>(null);
  const [samples, setSamples] = useState(true);
  const staff = useStaff();

  useEffect(() => {
    setMode(readMode());
    fetch("/api/statements/page")
      .then((r) => r.json())
      .then((j) => setLive(Boolean(j.live)))
      .catch(() => setLive(false));
  }, []);

  // Follow data changes made on the page (for example Clear samples) without a reload.
  useEffect(() => {
    const check = () => setSamples(hasSampleData(readMode()));
    check();
    window.addEventListener(DATA_EVENT, check);
    return () => window.removeEventListener(DATA_EVENT, check);
  }, [path]);

  // Shown while the app runs on seeded data or demo extraction: the firm demo always uses seeded clients.
  const demo = mode === "firm" || live === false || samples;

  useEffect(() => {
    fetch("/api/xero/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [path]);

  function choose(next: Mode) {
    if (next === mode) return;
    writeMode(next);
    // full reload so every screen loads the saved data for the chosen mode
    window.location.assign(next === "business" ? "/business" : "/board");
  }

  async function resetDemo() {
    if (!window.confirm("Restore the sample data? Everything you changed in this demo is removed, including statement PDFs stored in this browser.")) return;
    await resetDemoData(mode);
    window.location.assign(mode === "business" ? "/business" : "/board");
  }

  // The public pages (landing and pricing) have their own simple header, with no app tabs and no demo badge.
  if (path === "/" || path === "/pricing") {
    return (
      <header className="pub-header">
        <div className="p-wrap pub-header-in">
          <Link href="/" className="pub-brand"><span className="pub-mark" aria-hidden="true" />{SITE.name}</Link>
          <nav className="pub-nav" aria-label="Main">
            <Link href="/#how">How it works</Link>
            <Link href="/pricing" className={path === "/pricing" ? "on" : ""}>Pricing</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/#walkthrough">Contact</Link>
          </nav>
          <div className="pub-header-cta">
            <Link className="p-btn ghost hide-sm" href="/#walkthrough">Book a walkthrough</Link>
            <Link className="p-btn primary" href="/board">Open the demo</Link>
          </div>
        </div>
      </header>
    );
  }

  const link = (href: string, label: string) => (
    <Link href={href} className={path === href ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <header className="topbar">
      <span className="brand">
        {SITE.name}{SITE.workingName && <small>working name</small>}
      </span>
      <nav className="nav">
        {mode === "firm" ? link("/board", "Month board") : link("/business", "My documents")}
        {mode === "firm" && link("/clients", "Clients")}
        {link("/inbox", "Review queue")}
        {link("/statements", "Bank statements")}
        {link("/questions", "Client questions")}
        {mode === "firm" && link("/export", "Exports")}
        {mode === "firm" && link("/year-end", "Year-end")}
        {link("/upload", "Add documents")}
        {link("/import", "Import WhatsApp chat")}
      </nav>
      {demo && (
        <span className="demo-badge" title="Sample suppliers, clients and amounts are invented. Nothing here is a real result.">
          Demo: sample data
        </span>
      )}
      {mode === "firm" && (
        <label className="staff-switch" style={{ margin: 0 }}>
          Acting as
          <select aria-label="Acting as" value={staff.id} onChange={(e) => writeStaff(e.target.value)}>
            {STAFF.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <button className="reset-demo" onClick={resetDemo}>Reset demo</button>
      <div className="mode-toggle" role="group" aria-label={`Who is using ${SITE.name}`}>
        <button className={mode === "firm" ? "on" : ""} onClick={() => choose("firm")}>Accounting firm</button>
        <button className={mode === "business" ? "on" : ""} onClick={() => choose("business")}>My business</button>
      </div>
      <div className="xero-pill">
        {status?.connected ? (
          <span>Xero: {status.organisation}</span>
        ) : status?.configured ? (
          <a href="/api/xero/connect">Connect Xero</a>
        ) : (
          <span>Demo mode</span>
        )}
      </div>
    </header>
  );
}
