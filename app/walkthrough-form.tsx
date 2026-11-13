"use client";

import { useState } from "react";
import { SOFTWARE_OPTIONS } from "@/lib/landing-content";
import { SITE } from "@/lib/site-config";
import { validateWalkthrough, walkthroughEmail, type WalkthroughAnswers, type WalkthroughErrors } from "@/lib/walkthrough";

const EMPTY: WalkthroughAnswers = { name: "", firm: "", email: "", whatsapp: "", clients: "", software: "" };

export default function WalkthroughForm() {
  const [a, setA] = useState<WalkthroughAnswers>(EMPTY);
  const [errors, setErrors] = useState<WalkthroughErrors>({});
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof WalkthroughAnswers) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA({ ...a, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateWalkthrough(a);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const mail = walkthroughEmail(a);
    setDone(mail.body);
    window.location.href = mail.url;
  }

  return (
    <form className="p-form" onSubmit={submit} noValidate>
      <div className="p-form-grid">
        <div className="p-field">
          <label htmlFor="wt-name">Your name</label>
          <input id="wt-name" autoComplete="name" value={a.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} />
          {errors.name && <span className="p-err">{errors.name}</span>}
        </div>
        <div className="p-field">
          <label htmlFor="wt-firm">Firm name</label>
          <input id="wt-firm" autoComplete="organization" value={a.firm} onChange={set("firm")} />
        </div>
        <div className="p-field">
          <label htmlFor="wt-email">Email</label>
          <input id="wt-email" type="email" autoComplete="email" value={a.email} onChange={set("email")} aria-invalid={Boolean(errors.email)} />
          {errors.email && <span className="p-err">{errors.email}</span>}
        </div>
        <div className="p-field">
          <label htmlFor="wt-wa">WhatsApp number (optional)</label>
          <input id="wt-wa" inputMode="tel" autoComplete="tel" placeholder="60 12 345 6789" value={a.whatsapp} onChange={set("whatsapp")} aria-invalid={Boolean(errors.whatsapp)} />
          {errors.whatsapp && <span className="p-err">{errors.whatsapp}</span>}
        </div>
        <div className="p-field">
          <label htmlFor="wt-clients">Number of clients</label>
          <input id="wt-clients" inputMode="numeric" value={a.clients} onChange={set("clients")} aria-invalid={Boolean(errors.clients)} />
          {errors.clients && <span className="p-err">{errors.clients}</span>}
        </div>
        <div className="p-field">
          <label htmlFor="wt-sw">Accounting software your clients use</label>
          <select id="wt-sw" value={a.software} onChange={set("software")}>
            <option value="">Choose one</option>
            {SOFTWARE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <p className="p-form-note">
        There is no server behind this form yet. Pressing the button opens your email app with these answers filled in, addressed to {SITE.email}. Nothing is stored or sent until you press send in your email app.
      </p>
      <button type="submit" className="p-btn primary lg">Email my request</button>
      {done && (
        <div className="p-form-done" role="status">
          <strong>Your email app should have opened.</strong> If nothing happened, copy the text below into an email to {SITE.email}.
          <pre>{done}</pre>
        </div>
      )}
    </form>
  );
}
