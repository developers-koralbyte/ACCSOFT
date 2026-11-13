"use client";

import { useState } from "react";
import { fmtRM } from "@/lib/money";
import { labelFor } from "@/lib/tax";
import { acceptSuggestion, markBankOnly, planAnswer, recordAnswer, answerWithText, type AnswerPlan } from "@/lib/match/actions";
import type { ActivityKind } from "@/lib/activity";
import type { LineDecision, LineResult, PayeeMemory, Reconciliation } from "@/lib/match/types";
import type { AppState } from "@/lib/types";

// Logs one activity entry together with the change, in a single update.
export type Act = (kind: ActivityKind, text: string, fn: (s: AppState) => AppState, month?: string) => void;

export type CommitKind = "confirm" | "accept" | "bank-only" | "answer";

interface Prompt {
  r: LineResult;
  plan: AnswerPlan;
  decisions: Record<string, LineDecision>;
  text: string;
  kind: ActivityKind;
  month?: string;
}

// The shared "confirm a category and tax code" flow: it records the person's answer, and when the payee has other
// lines it asks "Apply to N other lines?" before remembering the answer for that payee.
export function useAnswerFlow(args: {
  recon: Reconciliation;
  decisions: Record<string, LineDecision>;
  memory: PayeeMemory;
  clientId: string;
  by: string;
  act: Act;
  payeeName: (r: LineResult) => string;
  onDone?: (key: string) => void;
}) {
  const { recon, decisions, memory, clientId, by, act, payeeName } = args;
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  function commit(r: LineResult, kind: CommitKind, category: string, tax: string, opts: { label: string; month?: string; answerText?: string }) {
    let dec = decisions;
    let activity: ActivityKind = "category-confirmed";
    let text = `Confirmed ${category} with ${labelFor(tax)} on ${opts.label}`;
    if (kind === "accept") {
      dec = acceptSuggestion(dec, r, category, tax, by);
      activity = "accepted";
      text = `Accepted the suggestion on ${opts.label}: ${r.ruleLabel}. Category ${category}, ${labelFor(tax)}`;
    } else if (kind === "bank-only") {
      dec = markBankOnly(dec, r.key, category, tax, by);
      activity = "bank-only";
      text = `Confirmed ${opts.label} as bank only: ${category}, ${labelFor(tax)}`;
    } else if (kind === "answer") {
      dec = answerWithText(dec, r.key, opts.answerText ?? "", category, tax, by);
      activity = "answer";
      text = `Recorded the client's answer on ${opts.label}: "${opts.answerText ?? ""}". Category ${category}, ${labelFor(tax)}`;
    }
    const plan = planAnswer(recon.results.values(), dec, r, category, tax, payeeName(r));
    if (plan.others.length > 0) {
      setPrompt({ r, plan, decisions: dec, text, kind: activity, month: opts.month });
      return;
    }
    const out = recordAnswer({ decisions: dec, memory, clientId, target: r, plan, applyToOthers: false });
    act(activity, text, (s) => ({ ...s, decisions: out.decisions, memory: out.memory }), opts.month);
    args.onDone?.(r.key);
  }

  function resolve(applyToOthers: boolean) {
    if (!prompt) return;
    const out = recordAnswer({ decisions: prompt.decisions, memory, clientId, target: prompt.r, plan: prompt.plan, applyToOthers });
    const extra = applyToOthers ? `. Applied to ${prompt.plan.others.length} other ${prompt.plan.others.length === 1 ? "line" : "lines"} for ${prompt.plan.payee} and remembered` : "";
    act(prompt.kind, prompt.text + extra, (s) => ({ ...s, decisions: out.decisions, memory: out.memory }), prompt.month);
    args.onDone?.(prompt.r.key);
    setPrompt(null);
  }

  const promptNode = prompt ? (
    <div className="pw" style={{ marginBottom: 12 }}>
      <strong>
        Apply {prompt.plan.category} with {labelFor(prompt.plan.taxCode)} to {prompt.plan.others.length} other {prompt.plan.others.length === 1 ? "line" : "lines"} for {prompt.plan.payee}?
      </strong>
      <div className="bill-meta" style={{ margin: "2px 0 10px" }}>
        Past lines are changed now and the answer is remembered for this client&apos;s future lines. Lines you already answered are left alone. {prompt.plan.others.length} {prompt.plan.others.length === 1 ? "line" : "lines"} will change.
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn" onClick={() => resolve(true)}>Apply to {prompt.plan.others.length} and remember</button>
        <button className="btn secondary" onClick={() => resolve(false)}>Only this line</button>
      </div>
    </div>
  ) : null;

  return { commit, promptNode };
}

export const lineLabel = (lineNo: number, date: string, amount: number, fmtD: (d: string) => string) => `line ${lineNo} (${fmtD(date)}, ${fmtRM(amount)})`;
