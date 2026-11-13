import { keyCovers } from "./memory";
import type { LineDecision, LineResult, MemoryEntry, PayeeMemory } from "./types";

// Pure helpers behind the matching screen. Each one returns new data and never edits its inputs.
// Nothing here runs by itself: every function is called from a person's click.

type Decisions = Record<string, LineDecision>;
const now = () => new Date().toISOString();

export function acceptSuggestion(decisions: Decisions, r: LineResult, category: string, taxCode: string): Decisions {
  return {
    ...decisions,
    [r.key]: { ...decisions[r.key], billIds: r.billIds, partial: r.partial, category, taxCode, categoryConfirmed: true, at: now() },
  };
}

export function rejectSuggestion(decisions: Decisions, r: LineResult): Decisions {
  const prev = decisions[r.key];
  return { ...decisions, [r.key]: { ...prev, rejected: Array.from(new Set([...(prev?.rejected ?? []), ...r.billIds])), at: now() } };
}

export function linkDocument(decisions: Decisions, key: string, billId: string, category: string, taxCode: string): Decisions {
  return { ...decisions, [key]: { ...decisions[key], billIds: [billId], bankOnly: false, category, taxCode, categoryConfirmed: true, at: now() } };
}

export function markBankOnly(decisions: Decisions, key: string, category: string, taxCode: string): Decisions {
  return { ...decisions, [key]: { ...decisions[key], bankOnly: true, category, taxCode, categoryConfirmed: true, at: now() } };
}

export function undoDecision(decisions: Decisions, key: string): Decisions {
  const next = { ...decisions };
  delete next[key];
  return next;
}

export interface AnswerPlan {
  memoryKey: string;
  payee: string;
  category: string;
  taxCode: string;
  others: LineResult[]; // other lines that would change if the person agrees
}

// What would change if this answer were remembered for the payee. Lines a person already answered are never touched.
export function planAnswer(
  results: Iterable<LineResult>,
  decisions: Decisions,
  target: LineResult,
  category: string,
  taxCode: string,
  payee: string,
): AnswerPlan {
  const others: LineResult[] = [];
  for (const r of Array.from(results)) {
    if (r.key === target.key) continue;
    const d = decisions[r.key];
    if (d?.category !== undefined || d?.taxCode !== undefined) continue;
    if (!keyCovers(target.memoryKey, r.memoryKey)) continue;
    if (r.category === category && r.taxCode === taxCode) continue;
    others.push(r);
  }
  return { memoryKey: target.memoryKey, payee, category, taxCode, others };
}

// Records a person's confirmed category and tax code for one line. When applyToOthers is true (or there is
// nothing else to change) the answer is also remembered for the payee, and existing lines are filled in.
export function recordAnswer(args: {
  decisions: Decisions;
  memory: PayeeMemory;
  clientId: string;
  target: LineResult;
  plan: AnswerPlan;
  applyToOthers: boolean;
}): { decisions: Decisions; memory: PayeeMemory } {
  const { target, plan, clientId } = args;
  const decisions: Decisions = {
    ...args.decisions,
    [target.key]: { ...args.decisions[target.key], category: plan.category, taxCode: plan.taxCode, categoryConfirmed: true, at: now() },
  };
  const remember = args.applyToOthers || plan.others.length === 0;
  if (!remember || !plan.memoryKey) return { decisions, memory: args.memory };

  if (args.applyToOthers) {
    for (const o of plan.others) {
      decisions[o.key] = { ...decisions[o.key], category: plan.category, taxCode: plan.taxCode, categoryConfirmed: true, learned: true, at: now() };
    }
  }
  const entry: MemoryEntry = { key: plan.memoryKey, payee: plan.payee, category: plan.category, taxCode: plan.taxCode, at: now() };
  return { decisions, memory: { ...args.memory, [clientId]: { ...(args.memory[clientId] ?? {}), [plan.memoryKey]: entry } } };
}
