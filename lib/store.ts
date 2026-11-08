"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppState } from "./types";
import { seedState } from "./demo";

const KEY = "docflow-state-v1";

// Demo storage lives in the browser. Replace with a database (for example Postgres on Vercel) before real client data goes in.
export function useDocflow() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      setState(raw ? (JSON.parse(raw) as AppState) : seedState());
    } catch {
      setState(seedState());
    }
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => {
      const base = prev ?? seedState();
      const next = fn(base);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable, keep in memory */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const fresh = seedState();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
    setState(fresh);
  }, []);

  return { state, update, reset };
}
