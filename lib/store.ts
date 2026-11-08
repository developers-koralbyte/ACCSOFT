"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "./types";
import { seedBusinessState, seedState } from "./demo";

export type Mode = "firm" | "business";

const MODE_KEY = "docflow-mode";
const KEYS: Record<Mode, string> = {
  firm: "docflow-state-v1",
  business: "docflow-business-v1",
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

function seed(mode: Mode): AppState {
  return mode === "business" ? seedBusinessState() : seedState();
}

// Demo storage lives in the browser. Replace with a database (for example Postgres on Vercel) before real client data goes in.
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
      setState(raw ? (JSON.parse(raw) as AppState) : seed(m));
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
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const fresh = seed(modeRef.current);
    try {
      window.localStorage.setItem(KEYS[modeRef.current], JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
    setState(fresh);
  }, []);

  return { state, update, reset, mode };
}
