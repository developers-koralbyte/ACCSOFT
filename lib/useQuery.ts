"use client";

import { useCallback, useEffect, useState } from "react";

// Reads and writes one URL query parameter, for example ?client=c1. Used so board cells can link straight to the work.
export function useQueryParam(name: string): [string | null, (v: string) => void] {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    try {
      setValue(new URLSearchParams(window.location.search).get(name));
    } catch {
      /* ignore */
    }
  }, [name]);
  const set = useCallback(
    (v: string) => {
      setValue(v);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set(name, v);
        window.history.replaceState(null, "", u.toString());
      } catch {
        /* ignore */
      }
    },
    [name],
  );
  return [value, set];
}
