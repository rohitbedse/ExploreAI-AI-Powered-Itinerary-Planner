"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  /** When false the tooltip is inert and `describedBy` is undefined. */
  enabled?: boolean;
  className?: string;
  /** Receives the id to put on the trigger's `aria-describedby`. */
  children: (describedBy: string | undefined) => React.ReactNode;
}

/**
 * Hover/focus tooltip. The bubble is always in the DOM (opacity only) so `aria-describedby`
 * resolves for screen readers the moment the trigger is focused; Esc dismisses it.
 */
export function Tooltip({ content, enabled = true, className, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children(enabled ? id : undefined)}
      {enabled && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "glass pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium shadow-e3 transition-[opacity,transform] duration-200",
            open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
