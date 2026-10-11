"use client";

import { useEffect, type RefObject } from "react";

type Listener = (x: number, y: number) => void;

// One shared pointer listener for every parallax element on the page. Subscribers only get
// normalised coordinates (-1..1) once per animation frame and write them to CSS variables on
// their own element, so the cursor never triggers a React render or a document-wide style recalc.
const listeners = new Set<Listener>();
let bound = false;
let frame = 0;
let nx = 0;
let ny = 0;

function onMove(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  nx = (e.clientX / window.innerWidth) * 2 - 1;
  ny = (e.clientY / window.innerHeight) * 2 - 1;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    listeners.forEach((fn) => fn(nx, ny));
  });
}

/**
 * Sets `--px` / `--py` (-1..1) on the element as the pointer moves. Children opt in with the
 * `.parallax` class and a `--depth` (px of travel). No-ops for reduced-motion and touch-only devices.
 */
export function useParallax(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const listener: Listener = (x, y) => {
      el.style.setProperty("--px", x.toFixed(3));
      el.style.setProperty("--py", y.toFixed(3));
    };
    listeners.add(listener);
    if (!bound) {
      window.addEventListener("pointermove", onMove, { passive: true });
      bound = true;
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && bound) {
        window.removeEventListener("pointermove", onMove);
        bound = false;
      }
    };
  }, [ref, enabled]);
}
