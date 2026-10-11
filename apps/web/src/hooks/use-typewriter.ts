"use client";

import { useEffect, useState } from "react";

const TYPE_MS = 34;
const DELETE_MS = 14;
const HOLD_MS = 2000;
const GAP_MS = 380;

/**
 * Cycles through `phrases`, typing then erasing each. Returns the text to show right now.
 * Reduced motion: no typing, just swaps the full phrase every few seconds.
 * `enabled=false` pauses the loop (e.g. once the user has typed something).
 */
export function useTypewriter(phrases: readonly string[], enabled: boolean): string {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let i = 0;
      setText(phrases[0]);
      const id = setInterval(() => {
        i = (i + 1) % phrases.length;
        setText(phrases[i]);
      }, 4500);
      return () => clearInterval(id);
    }

    let phraseIdx = 0;
    let chars = 0;
    let phase: "type" | "hold" | "erase" = "type";
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      const phrase = phrases[phraseIdx];
      if (phase === "type") {
        chars += 1;
        setText(phrase.slice(0, chars));
        if (chars >= phrase.length) {
          phase = "hold";
          timer = setTimeout(step, HOLD_MS);
        } else {
          timer = setTimeout(step, TYPE_MS + Math.random() * 28); // uneven cadence reads as typing
        }
      } else if (phase === "hold") {
        phase = "erase";
        step();
      } else {
        chars = Math.max(0, chars - 2);
        setText(phrase.slice(0, chars));
        if (chars === 0) {
          phraseIdx = (phraseIdx + 1) % phrases.length;
          phase = "type";
          timer = setTimeout(step, GAP_MS);
        } else {
          timer = setTimeout(step, DELETE_MS);
        }
      }
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [phrases, enabled]);

  return enabled ? text : "";
}
