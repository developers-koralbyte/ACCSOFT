import { addActivity } from "@/lib/activity";
import { buildMissingMessage, PACKS } from "@/lib/chase/templates";
import { chaseKinds } from "@/lib/chase/missing";
import { sendWhatsApp } from "@/lib/chase/send";
import { monthName } from "@/lib/money";
import type { AppState } from "@/lib/types";

// Opens the missing-documents message on WhatsApp for a client and records the chase. Used by the board and the questions page.
export function chaseClient(update: (fn: (s: AppState) => AppState) => void, state: AppState, clientId: string, month: string, by: string): { ok: boolean; kinds: string[] } {
  const client = state.clients.find((c) => c.id === clientId);
  if (!client) return { ok: false, kinds: [] };
  const lang = client.language ?? "en";
  const kinds = chaseKinds(state, clientId, month);
  const res = sendWhatsApp(client.phone, buildMissingMessage(lang, client.name, month, kinds));
  const at = new Date().toISOString();
  update((s) =>
    addActivity(
      {
        ...s,
        chases: { ...s.chases, [`${clientId}:${month}`]: { clientId, month, at, by } },
        clients: s.clients.map((c) => (c.id === clientId ? { ...c, lastReminder: at } : c)),
      },
      { clientId, month, by, kind: "chase", text: `Chased ${kinds.length} missing ${kinds.length === 1 ? "document" : "documents"} for ${monthName(month)} (${kinds.join(", ")}) on WhatsApp in ${PACKS[lang].label}`, at },
    ),
  );
  return { ok: res.ok, kinds };
}
