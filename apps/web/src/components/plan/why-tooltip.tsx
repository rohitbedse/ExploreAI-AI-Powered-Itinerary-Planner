"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

/** Tooltip that works with hover, keyboard focus, touch (tap toggles) and Esc to dismiss. */
export function WhyTooltip({ text, stopName }: { text: string; stopName: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Why we picked ${stopName}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-brand transition-colors hover:bg-brand-soft"
      >
        <Info className="size-4" aria-hidden />
        Why this pick
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="glass absolute bottom-full left-0 z-20 mb-2 w-64 rounded-2xl p-3.5 text-sm leading-relaxed shadow-e3"
        >
          {text}
        </span>
      )}
    </span>
  );
}
