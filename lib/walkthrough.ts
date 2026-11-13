import { emailContactUrl, SITE } from "./site-config";

// The "Book a 15-minute walkthrough" form has no backend. Pressing the button builds an email to the address in
// site-config with the answers filled in. Nothing is stored or sent by this code.

export interface WalkthroughAnswers {
  name: string;
  firm: string;
  email: string;
  whatsapp: string;
  clients: string;
  software: string;
}

export type WalkthroughErrors = Partial<Record<keyof WalkthroughAnswers, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateWalkthrough(a: WalkthroughAnswers): WalkthroughErrors {
  const e: WalkthroughErrors = {};
  if (!a.name.trim()) e.name = "Please enter your name.";
  if (!a.email.trim()) e.email = "Please enter your email so we can reply.";
  else if (!EMAIL_RE.test(a.email.trim())) e.email = "That email address does not look right.";
  const digits = a.whatsapp.replace(/\D/g, "");
  if (a.whatsapp.trim() && (digits.length < 8 || digits.length > 15)) e.whatsapp = "Enter the number with its country code, for example 60 12 345 6789.";
  if (a.clients.trim() && !/^\d{1,5}$/.test(a.clients.trim())) e.clients = "Enter a whole number.";
  return e;
}

export function walkthroughEmail(a: WalkthroughAnswers): { subject: string; body: string; url: string } {
  const who = a.firm.trim() || a.name.trim();
  const subject = `15-minute walkthrough request: ${who}`;
  const line = (label: string, v: string) => `${label}: ${v.trim() || "(not given)"}`;
  const body = [
    `Hello, I would like a 15-minute walkthrough of ${SITE.name}.`,
    "",
    line("Name", a.name),
    line("Firm", a.firm),
    line("Email", a.email),
    line("WhatsApp number", a.whatsapp),
    line("Number of clients", a.clients),
    line("Accounting software our clients use", a.software),
  ].join("\n");
  return { subject, body, url: emailContactUrl(subject, body) };
}
