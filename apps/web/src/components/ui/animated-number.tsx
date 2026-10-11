"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  format?: (n: number) => string;
  /** Milliseconds. */
  duration?: number;
  className?: string;
}

// easeOutExpo: matches EASE.outExpo in lib/motion.ts
const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts up to `value` (and between values on change). The animated text is hidden from
 * assistive tech; a static sr-only copy carries the real value. Reduced motion: no animation.
 */
export function AnimatedNumber({ value, format = String, duration = 900, className }: Props) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(0);
  const fmt = useRef(format);

  useEffect(() => {
    fmt.current = format;
  }, [format]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = from + (value - from) * ease(t);
      shown.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {format(Math.round(display))}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
