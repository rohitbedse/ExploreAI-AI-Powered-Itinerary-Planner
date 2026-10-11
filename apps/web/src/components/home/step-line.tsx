"use client";

import { m } from "motion/react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Connector that draws itself when scrolled into view. Reduced motion: shown fully drawn. */
export function StepLine({ orientation, className }: { orientation: "horizontal" | "vertical"; className?: string }) {
  const horizontal = orientation === "horizontal";
  return (
    <m.div
      aria-hidden="true"
      className={cn("rounded-full opacity-70", className)}
      style={{
        background: "var(--gradient-brand)",
        transformOrigin: horizontal ? "left center" : "center top",
      }}
      initial={horizontal ? { scaleX: 0 } : { scaleY: 0 }}
      whileInView={horizontal ? { scaleX: 1 } : { scaleY: 1 }}
      viewport={{ once: true, margin: "0px 0px -25% 0px" }}
      transition={{ duration: 1.6, ease: EASE.outExpo, delay: 0.15 }}
    />
  );
}
