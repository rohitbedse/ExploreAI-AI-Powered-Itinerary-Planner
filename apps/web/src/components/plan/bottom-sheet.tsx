"use client";

import { ChevronUp, Map as MapIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Mobile map container: a collapsed bar that expands upward. Content stays mounted. */
export function BottomSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <section
      aria-label="Map"
      className="glass fixed inset-x-0 bottom-0 z-30 rounded-t-3xl shadow-e4"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-t-3xl text-sm font-semibold"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-muted-foreground/40" />
        <span className="flex items-center gap-2">
          <MapIcon className="size-4" aria-hidden />
          {open ? "Hide map" : "Show map"}
          <ChevronUp className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      <div
        id={id}
        className={cn("overflow-hidden transition-[height] duration-300 motion-reduce:transition-none", open ? "h-[60vh]" : "h-0")}
        aria-hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
