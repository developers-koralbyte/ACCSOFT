import { SITE } from "./site-config";

// All copy for the public landing page lives here, so it can be reviewed and tested in one place.
// Rules: no customer logos, no testimonials, no invented statistics, no claims about time saved.
// Where something is not built yet, the text says so.

export const POINTS = [
  { title: "Collect documents from WhatsApp", text: "Today you import a chat export with its photos and PDFs in one go, and every document is read for review. Live forwarding to a WhatsApp number is in development." },
  { title: "Every bank statement is proven to the cent", text: "Opening balance plus money in, less money out, must equal the closing balance, and every running balance must agree line by line. A break is pointed to the exact line." },
  { title: "Works with the ledger you already use", text: "Bank statement CSVs for Xero and QuickBooks today, with draft templates for SQL Account, AutoCount and Zoho Books. Xero draft bill posting is built in." },
];

export interface Feature {
  id: string;
  title: string;
  text: string;
  img: string;
  alt: string;
  w: number;
  h: number;
}

export const FEATURES: Feature[] = [
  {
    id: "documents",
    title: "Documents and statements from WhatsApp",
    text: "Import a client's WhatsApp chat export with its photos and PDFs in one go. Bank statements found in the chat go straight to proof. Live forwarding to a WhatsApp number is in development.",
    img: "/screens/f-documents.jpg",
    alt: "The review queue listing documents read from a WhatsApp import, with warnings",
    w: 2080,
    h: 1280,
  },
  {
    id: "proof",
    title: "Every statement proven to the cent",
    text: "Opening balance plus money in, less money out, must equal the closing balance, and every running balance must agree. A break is pointed to the exact line, ready to correct.",
    img: "/screens/f-proof.jpg",
    alt: "A bank statement shown as proven to the cent, with the balance sums and every line",
    w: 2080,
    h: 1280,
  },
  {
    id: "matching",
    title: "Lines matched by clear rules",
    text: "Exact amount with an invoice reference, then the payee within 7 days, then a single candidate within 3 days. The rule behind every match is recorded, and nothing is confirmed for you.",
    img: "/screens/f-matching.jpg",
    alt: "Bank lines matched to documents, each showing the rule used",
    w: 2080,
    h: 1280,
  },
  {
    id: "questions",
    title: "Clients asked about what cannot be explained",
    text: "Each unexplained payment becomes a short question, and all open questions go to the client as one WhatsApp message that opens ready for you to send. The Bahasa Malaysia and Mandarin wording is still being checked by native speakers.",
    img: "/screens/f-questions.jpg",
    alt: "Open client questions and the single WhatsApp message built from them",
    w: 2080,
    h: 1280,
  },
  {
    id: "board",
    title: "The month board",
    text: "One row per client and five stages, worked out from the data: received, proven, matched, answered and approved. Click any cell to open the exact work.",
    img: "/screens/f-board.jpg",
    alt: "The month board with a row for each client and five stages",
    w: 2080,
    h: 1280,
  },
  {
    id: "signoff",
    title: "Two-person sign-off and the audit pack",
    text: "One person prepares and a different person reviews, then the month locks. The audit pack holds the reconciliation statement, the rule or person behind every match, the answers, the sign-off and the activity log.",
    img: "/screens/f-signoff.jpg",
    alt: "A printable bank reconciliation statement from an approved month",
    w: 2080,
    h: 1280,
  },
  {
    id: "export",
    title: "Exports to the ledger you use",
    text: "Bank statement CSVs for Xero and QuickBooks, and draft templates for SQL Account, AutoCount and Zoho Books that must be checked against each product's own import. Xero draft bills can be posted from the review queue.",
    img: "/screens/f-export.jpg",
    alt: "The export page with the ledger setting and the audit pack download",
    w: 2080,
    h: 1280,
  },
];

export interface Faq {
  q: string;
  a: string[]; // paragraphs
}

export const FAQ: Faq[] = [
  {
    q: "Do my clients need to install an app?",
    a: [
      "No. Your clients do not need to install anything. Today you collect their documents by importing a WhatsApp chat export (the chat with its photos and PDFs) or by adding files yourself.",
      `Live forwarding, where a client sends documents to a WhatsApp number and they arrive automatically, is in development and is not built yet. Your firm uses ${SITE.name} in a web browser.`,
    ],
  },
  {
    q: "Which accounting software does it work with?",
    a: [
      "Xero: approved bills can be posted as drafts (this needs a Xero connection, and in the demo nothing is posted anywhere), and there is a bank statement CSV. QuickBooks: a bank transactions CSV in the 3 or 4 column layout.",
      "SQL Account, AutoCount and Zoho Books: draft export templates that must be checked against each product's own import before use. Other: a generic CSV with every field. There is no direct sync to any of them yet.",
    ],
  },
  {
    q: "What happens when the AI gets something wrong?",
    a: [
      "A digital bank statement is read from the PDF's own text, not guessed by AI, and then proven to the cent. If a line does not agree with the running balance, the exact line is flagged and you correct it on the spot, then the proof runs again.",
      "Documents read by AI (invoices, receipts, scanned pages) go to a review queue with warnings for mismatched totals, duplicates and low confidence. Nothing is posted or approved without a person, suggestions are never applied automatically, and every match records the rule or person behind it. In the demo, document reading returns sample data unless an AI key is set.",
    ],
  },
  {
    q: "Where is my data kept?",
    a: [
      "This demo keeps everything in your browser only. Digital statements are read on your device and nothing is uploaded to a server. A hosted version with login and a database is in development and does not exist yet.",
      "Until then, treat the demo as a way to evaluate the product. If live AI reading is switched on, the document being read is sent to the AI provider to be read.",
    ],
  },
  {
    q: "Does it handle password-protected bank statements?",
    a: [
      "Yes. You are asked for the password, it unlocks the PDF in your browser, it is kept in memory only and it is never saved. We never ask for online banking logins.",
    ],
  },
  {
    q: "How is \"active client\" counted for billing?",
    a: [
      "An active client is one that sends at least one document or statement in the month. A client that sends nothing that month is not counted for that month.",
      "See the pricing page for the prices and a calculator.",
    ],
  },
  {
    q: "Can I try it with my own bank statement?",
    a: [
      "Yes. On Bank statements, choose a digital PDF. It is read in your browser, proven to the cent, and you can match it and export from it. The reader has been tested on a small number of bank layouts, so a different layout may need tuning. If it cannot read a statement it says so rather than guessing.",
      "Scanned or photographed statements need live AI reading, which is off in the demo.",
    ],
  },
];

export const SOFTWARE_OPTIONS = ["Xero", "QuickBooks", "SQL Account", "AutoCount", "Zoho Books", "Other", "Not sure"];
