"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DATA_EVENT, hasSampleData, readMode, writeMode, type Mode } from "@/lib/store";

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
    window.location.assign(next === "business" ? "/business" : "/");
  }

  const link = (href: string, label: string) => (
    <Link href={href} className={path === href ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <header className="topbar">
      <span className="brand">
        DocFlow<small>working name</small>
      </span>
      <nav className="nav">
        {mode === "firm" ? link("/", "Clients") : link("/business", "My documents")}
        {link("/inbox", "Review queue")}
        {link("/statements", "Bank statements")}
        {link("/upload", "Add documents")}
        {link("/import", "Import WhatsApp chat")}
      </nav>
      {demo && (
        <span className="demo-badge" title="Sample suppliers, clients and amounts are invented. Nothing here is a real result.">
          Demo: sample data
        </span>
      )}
      <div className="mode-toggle" role="group" aria-label="Who is using DocFlow">
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
