"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Status {
  configured: boolean;
  connected: boolean;
  organisation: string | null;
}

export default function Nav() {
  const path = usePathname();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/xero/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [path]);

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
        {link("/", "Clients")}
        {link("/inbox", "Review queue")}
        {link("/upload", "Add documents")}
      </nav>
      <div className="xero-pill">
        {status?.connected ? (
          <span>Xero: {status.organisation}</span>
        ) : status?.configured ? (
          <a href="/api/xero/connect">Connect Xero</a>
        ) : (
          <span>Demo mode (Xero not configured)</span>
        )}
      </div>
    </header>
  );
}
