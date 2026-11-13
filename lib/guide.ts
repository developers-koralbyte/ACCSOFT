import { DEMO_MONTH } from "./config";
import { getMonth } from "./month/records";
import { approvalStatus } from "./month/signoff";
import { reconcileForClient } from "./month/snapshot";
import { monthOf } from "./money";
import type { AppState } from "./types";

// The guided demo: seven short steps on Seri Murni Trading. Each step can tick itself off from the data.
// Runs with no API key. A person can finish it in under two minutes.

export interface GuideStep {
  id: string;
  title: string;
  text: string;
  href: string;
  done?: (s: AppState) => boolean; // when absent the step is done by pressing Next
}

const C = "c1";

function octSummary(s: AppState) {
  const oct = s.statements.find((x) => x.clientId === C && monthOf(x.periodEnd) === DEMO_MONTH);
  if (!oct) return undefined;
  return reconcileForClient(s, C).summaries.get(oct.id);
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "upload",
    title: "Upload a sample statement",
    text: "Click \"September 2026 (clean)\", then \"October 2026 (follows September)\". Each one is a real PDF read in your browser, the same path as your own files.",
    href: "/statements?client=c1",
    done: (s) => ["2026-09", "2026-10"].every((m) => s.statements.some((x) => x.clientId === C && monthOf(x.periodEnd) === m)),
  },
  {
    id: "proof",
    title: "See it proven to the cent",
    text: "Open the October statement. Opening balance plus money in, less money out, equals the closing balance, and every running balance agrees line by line.",
    href: "/statements?client=c1",
  },
  {
    id: "match",
    title: "Match the lines to documents",
    text: "On the October statement, accept the Bintang suggestion (it needs a click), then press \"Confirm all\" for the bank only lines. Nothing is confirmed for you.",
    href: "/statements?client=c1",
    done: (s) => {
      const sum = octSummary(s);
      return Boolean(sum && sum.counts.suggested === 0 && sum.bankOnlyToConfirm === 0);
    },
  },
  {
    id: "ask",
    title: "Ask the client what they cannot explain",
    text: "Two payments have no document. Send both questions as one WhatsApp message, then record the answers (\"Use example answer\" fills one in).",
    href: "/questions?client=c1&month=2026-10",
    done: (s) => {
      const sum = octSummary(s);
      return Boolean(sum && sum.counts.unexplained === 0);
    },
  },
  {
    id: "board",
    title: "Look at the month board",
    text: "Every client, five stages, worked out from the data. Seri Murni is ready to approve. Click its Approved cell.",
    href: "/board",
  },
  {
    id: "approve",
    title: "Approve with two people",
    text: "Mark it prepared as Aisyah. Switch \"Acting as\" to Daniel in the top bar. Tick the acknowledgement for the missing rent receipt, then approve.",
    href: "/month?client=c1&month=2026-10",
    done: (s) => approvalStatus(getMonth(s, C, DEMO_MONTH)) === "approved",
  },
  {
    id: "pack",
    title: "Download the audit pack",
    text: "One ZIP: the printable reconciliation statement, every match with the rule or person behind it, the answers, the sign-off and the activity log.",
    href: "/export?client=c1&month=2026-10",
  },
];

export interface GuideState {
  active: boolean;
  step: number;
}

export const GUIDE_KEY = "docflow-guide";
