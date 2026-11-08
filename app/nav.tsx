"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readMode, writeMode, type Mode } from "@/lib/store";

interface Status {
  configured: boolean;
  connected: boolean;
  organisation: string | null;
}

export default function Nav() {
  const path = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>("firm");

  useEffect(() => {
    setMode(readMode());
  }, []);

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
        {link("/upload", "Add documents")}
        {link("/import", "Import WhatsApp chat")}
      </nav>
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
