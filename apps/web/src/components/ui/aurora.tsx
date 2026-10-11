"use client";

import { useEffect, useRef } from "react";
import { useParallax } from "@/hooks/use-parallax";

// Blob position/colour/drift. Only `transform` animates (GPU compositor, no repaint).
// `depth` is the parallax travel in px; blobs move opposite the pointer at different speeds.
const BLOBS = [
  { c: "var(--brand-indigo)", left: "-12%", top: "-18%", x: "14vw", y: "10vh", d: "26s", depth: -34 },
  { c: "var(--brand-pink)", left: "55%", top: "-10%", x: "-12vw", y: "14vh", d: "32s", depth: 46 },
  { c: "var(--brand-violet)", left: "-8%", top: "48%", x: "10vw", y: "-12vh", d: "29s", depth: 28 },
  { c: "var(--brand-amber)", left: "60%", top: "55%", x: "-14vw", y: "-8vh", d: "35s", depth: -52 },
] as const;

/**
 * Animated aurora backdrop. Fixed behind the page by default; `contained` fits it to a
 * positioned parent (used on /design). Animations pause while the tab is hidden and are
 * disabled by prefers-reduced-motion in CSS. `parallax` shifts each blob slightly with the pointer.
 */
export function Aurora({ contained = false, parallax = false }: { contained?: boolean; parallax?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  useParallax(parallaxRef, parallax);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      el.dataset.paused = String(document.hidden);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="aurora" data-contained={contained}>
      <div ref={parallaxRef} className="aurora-layer">
        {BLOBS.map((b, i) => (
          <div key={i} className="aurora-layer parallax" style={{ "--depth": b.depth } as React.CSSProperties}>
            <div
              className="aurora-blob"
              style={{ left: b.left, top: b.top, "--c": b.c, "--x": b.x, "--y": b.y, "--d": b.d } as React.CSSProperties}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
