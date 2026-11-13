import { toSen } from "../money";
import { monthOf } from "../money";
import { missingDocuments } from "../chase/missing";
import { reconcileClient } from "../match/engine";
import { proveStatement } from "../statements/proof";
import type { AppState } from "../types";
import type { LineState } from "../match/types";
import { getMonth } from "./records";
import type { MonthSnapshot, SnapBill, SnapLine, SnapStatement } from "./types";

// Statements of every OTHER approved month of this client keep their stored snapshot.
export function frozenStatements(state: AppState, clientId: string, exceptMonth?: string): Record<string, SnapStatement> {
  const out: Record<string, SnapStatement> = {};
  for (const rec of Object.values(state.months)) {
    if (rec.clientId !== clientId || !rec.snapshot || rec.month === exceptMonth) continue;
    for (const s of rec.snapshot.statements) out[s.id] = s;
  }
  return out;
}

// Reconciliation for one client with approved months frozen. This is what every screen should use.
export function reconcileForClient(state: AppState, clientId: string, exceptMonth?: string) {
  return reconcileClient({
    statements: state.statements.filter((s) => s.clientId === clientId),
    bills: state.bills.filter((b) => b.clientId === clientId),
    decisions: state.decisions,
    memory: state.memory[clientId] ?? {},
    modelSuggestions: state.modelSuggestions,
    frozen: frozenStatements(state, clientId, exceptMonth),
  });
}

// Everything about a month as it stands now: proof, every line's state and match, categories, tax codes, answers.
export function buildSnapshot(state: AppState, clientId: string, month: string, at: string): MonthSnapshot {
  const recon = reconcileForClient(state, clientId, month);
  const rec = getMonth(state, clientId, month);
  const statements = state.statements.filter((s) => s.clientId === clientId && monthOf(s.periodEnd) === month);
  const billIds = new Set<string>();

  const snapStatements: SnapStatement[] = statements.map((s) => {
    const proof = proveStatement(s);
    const summary = recon.summaries.get(s.id);
    const lines: SnapLine[] = [];
    for (const l of s.lines) {
      const r = recon.results.get(`${s.id}:${l.id}`);
      if (!r) continue;
      r.billIds.forEach((id) => billIds.add(id));
      lines.push({
        lineId: l.id,
        lineNo: r.lineNo,
        date: l.date,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
        page: l.page,
        state: r.state,
        rule: r.rule,
        ruleLabel: r.ruleLabel,
        billIds: r.billIds,
        category: r.category,
        taxCode: r.taxCode,
        categoryConfirmed: r.categoryConfirmed,
        learned: r.learned,
        accepted: r.accepted,
        answer: r.answer,
        questionSentAt: state.questions[r.key]?.sentAt,
        corrected: l.corrected ? { debit: l.corrected.debit, credit: l.corrected.credit } : undefined,
      });
    }
    const counts: Record<LineState, number> = summary?.counts ?? { matched: 0, suggested: 0, "bank-only": 0, unexplained: 0, answered: 0 };
    return {
      id: s.id,
      fileName: s.fileName,
      bank: s.bank,
      accountLast4: s.accountLast4,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      opening: s.opening,
      closing: s.closing,
      proofStatus: proof.status,
      proofLabel: proof.label,
      totalDebit: proof.totalDebit,
      totalCredit: proof.totalCredit,
      totalsOnlyAcknowledged: rec.ackTotalsOnly.includes(s.id),
      booksBalance: rec.booksBalance?.[s.id] ?? null,
      counts: { ...counts },
      reconciled: Boolean(summary?.reconciled),
      lines,
    };
  });

  const bills: SnapBill[] = state.bills
    .filter((b) => billIds.has(b.id))
    .map((b) => ({ id: b.id, supplier: b.supplier, invoiceNo: b.invoiceNo, date: b.date, subtotal: toSen(b.subtotal), tax: toSen(b.tax), total: toSen(b.total), category: b.account, taxCode: b.taxCode }));

  const missing = missingDocuments(state, clientId, month);
  return {
    takenAt: at,
    statements: snapStatements,
    bills,
    missingDocs: missing.map((m) => m.kind),
    waived: [...rec.waived],
    outstandingDocs: missing.length,
  };
}

// Documents used by any approved month: their fields are locked until that month is reopened.
export function lockedBills(state: AppState): Map<string, { clientId: string; month: string }> {
  const out = new Map<string, { clientId: string; month: string }>();
  for (const rec of Object.values(state.months)) {
    if (!rec.snapshot) continue;
    for (const b of rec.snapshot.bills) out.set(b.id, { clientId: rec.clientId, month: rec.month });
  }
  return out;
}
