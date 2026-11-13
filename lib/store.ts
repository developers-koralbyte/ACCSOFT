"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "./types";
import { seedBusinessState, seedState } from "./demo";
import { SELF, STAFF, staffById, type Staff } from "./staff";
import { clearAllFiles } from "./files";

export type Mode = "firm" | "business";

const MODE_KEY = "docflow-mode";
const KEYS: Record<Mode, string> = {
  firm: "docflow-state-v3",
  business: "docflow-business-v3",
};

export function readMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "business" ? "business" : "firm";
  } catch {
    return "firm";
  }
}

export function writeMode(mode: Mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

// Lets screens that stay mounted (the top bar) hear about data changes made elsewhere in the same tab.
export const DATA_EVENT = "docflow-data";
function announce() {
  try {
    window.dispatchEvent(new Event(DATA_EVENT));
  } catch {
    /* ignore */
  }
}

// True when the saved data for a mode still holds sample items (sample documents or sample statements).
export function hasSampleData(mode: Mode): boolean {
  try {
    const raw = window.localStorage.getItem(KEYS[mode]);
    const st = raw ? (JSON.parse(raw) as Partial<AppState>) : seed(mode);
    return Boolean(st.bills?.some((b) => b.sample) || st.statements?.some((x) => x.kind === "sample"));
  } catch {
    return true;
  }
}

function seed(mode: Mode): AppState {
  return mode === "business" ? seedBusinessState() : seedState();
}

// Saved data from an older build may lack newer collections. Fill them in so screens never see undefined.
function normalise(raw: Partial<AppState>, mode: Mode): AppState {
  const base = seed(mode);
  return {
    clients: raw.clients ?? base.clients,
    bills: raw.bills ?? base.bills,
    statements: raw.statements ?? [],
    decisions: raw.decisions ?? {},
    memory: raw.memory ?? {},
    modelSuggestions: raw.modelSuggestions ?? [],
    questions: raw.questions ?? {},
    history: raw.history ?? [],
    chases: raw.chases ?? {},
    months: raw.months ?? {},
    activity: raw.activity ?? [],
  };
}

// ALL reads and writes of app data go through this module. Screens only call useDocflow(), so a real database
// can replace localStorage here without touching any screen. Demo storage lives in the browser only; replace it
// (for example with Postgres on Vercel) before real client data goes in.
// Firm mode and business mode keep separate saved data so demo clients never mix with an SME's own documents.
export function useDocflow() {
  const [state, setState] = useState<AppState | null>(null);
  const [mode, setMode] = useState<Mode>("firm");
  const modeRef = useRef<Mode>("firm");

  useEffect(() => {
    const m = readMode();
    modeRef.current = m;
    setMode(m);
    try {
      const raw = window.localStorage.getItem(KEYS[m]);
      setState(raw ? normalise(JSON.parse(raw) as Partial<AppState>, m) : seed(m));
    } catch {
      setState(seed(m));
    }
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => {
      const base = prev ?? seed(modeRef.current);
      const next = fn(base);
      try {
        window.localStorage.setItem(KEYS[modeRef.current], JSON.stringify(next));
      } catch {
        /* storage unavailable, keep in memory */
      }
      setTimeout(announce, 0);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    void clearAllFiles(); // stored statement PDFs go with the demo data
    const fresh = seed(modeRef.current);
    try {
      window.localStorage.setItem(KEYS[modeRef.current], JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
    setState(fresh);
    announce();
  }, []);

  return { state, update, reset, mode };
}

// ---------- who is acting (demo staff switch) ----------
const STAFF_KEY = "docflow-staff";

export function readStaff(): Staff {
  try {
    if (readMode() === "business") return SELF;
    return staffById(window.localStorage.getItem(STAFF_KEY) ?? STAFF[0].id);
  } catch {
    return STAFF[0];
  }
}

export function writeStaff(id: string) {
  try {
    window.localStorage.setItem(STAFF_KEY, id);
  } catch {
    /* ignore */
  }
  announce();
}

// The person acting right now. Follows the switch in the top bar.
export function useStaff(): Staff {
  const [staff, setStaff] = useState<Staff>(STAFF[0]);
  useEffect(() => {
    const read = () => setStaff(readStaff());
    read();
    window.addEventListener(DATA_EVENT, read);
    return () => window.removeEventListener(DATA_EVENT, read);
  }, []);
  return staff;
}

// Restores the seeded data for a mode, wipes stored statement files and the guided demo progress. Used by the top bar.
export async function resetDemoData(mode: Mode): Promise<void> {
  await clearAllFiles();
  try {
    window.localStorage.setItem(KEYS[mode], JSON.stringify(seed(mode)));
    window.localStorage.removeItem("docflow-guide");
  } catch {
    /* ignore */
  }
  announce();
}
