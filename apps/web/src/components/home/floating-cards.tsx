"use client";

import { useRef } from "react";
import { useParallax } from "@/hooks/use-parallax";
import { cn } from "@/lib/utils";

// Decorative only: low-opacity mini-itinerary cards drifting around the prompt box. Hidden below lg.
// Layers: positioned wrapper > .parallax (pointer) > .float-card (idle bob), so transforms never collide.
const CARDS = [
  { text: "☕ Café · ₹180", pos: "lg:-left-24 xl:-left-44 top-4", depth: 26, rot: -4, dur: 7, delay: 0 },
  { text: "🌳 Park · Free", pos: "lg:-right-24 xl:-right-40 top-16", depth: -34, rot: 3, dur: 8.5, delay: 0.6 },
  { text: "🚶 8 min", pos: "lg:-left-16 xl:-left-36 bottom-24", depth: -22, rot: 2, dur: 6.5, delay: 1.2 },
  { text: "🎨 Gallery · ₹120", pos: "lg:-right-16 xl:-right-36 bottom-32", depth: 30, rot: -3, dur: 9, delay: 0.3 },
  { text: "🍜 Dinner · ₹350", pos: "right-[12%] -top-9", depth: -18, rot: 2, dur: 7.5, delay: 0.9 },
] as const;

export function FloatingCards() {
  const ref = useRef<HTMLDivElement>(null);
  useParallax(ref);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      {CARDS.map((c) => (
        <div key={c.text} className={cn("absolute", c.pos)}>
          <div className="parallax" style={{ "--depth": c.depth } as React.CSSProperties}>
            <div
              className="float-card glass shadow-e2"
              style={{ "--rot": `${c.rot}deg`, "--dur": `${c.dur}s`, "--delay": `${c.delay}s` } as React.CSSProperties}
            >
              {c.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
