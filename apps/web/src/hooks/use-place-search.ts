"use client";

import { useEffect, useState } from "react";
import { searchPlaces, type Place } from "@/lib/geocode";

export type SearchStatus = "idle" | "loading" | "done" | "error";

const DEBOUNCE_MS = 350; // Photon asks clients to be gentle; this also avoids a request per keystroke
const MIN_CHARS = 2;

export function usePlaceSearch(query: string) {
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ac = new AbortController();
    setStatus("loading");
    const timer = setTimeout(() => {
      searchPlaces(q, ac.signal)
        .then((places) => {
          setResults(places);
          setStatus("done");
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setResults([]);
            setStatus("error");
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query]);

  return { results, status };
}
