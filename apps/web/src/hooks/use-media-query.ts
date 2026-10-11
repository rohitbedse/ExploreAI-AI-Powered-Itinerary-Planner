"use client";

import { useCallback, useSyncExternalStore } from "react";

/** `null` until hydrated (server snapshot), then the live match state. */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
