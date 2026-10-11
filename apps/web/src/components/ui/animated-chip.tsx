"use client";

import { m, type HTMLMotionProps } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "cost" | "time" | "travel" | "rating" | "mood";

export const TONE: Record<Tone, string> = {
  neutral: "bg-card/70 text-foreground border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  cost: "bg-cost-soft text-cost border-transparent",
  time: "bg-time-soft text-time border-transparent",
  travel: "bg-travel-soft text-travel border-transparent",
  rating: "bg-rating-soft text-rating border-transparent",
  mood: "bg-mood-soft text-mood border-transparent",
};

interface Props extends HTMLMotionProps<"button"> {
  tone?: Tone;
}

/** Pill button with a springy hover lift and press. Used for examples and quick actions. */
export function AnimatedChip({ className, tone = "neutral", type = "button", ...props }: Props) {
  const idle = props.disabled;
  return (
    <m.button
      type={type}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-e1 backdrop-blur transition-colors hover:border-ring/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        TONE[tone],
        className,
      )}
      whileHover={idle ? undefined : { y: -2 }}
      whileTap={idle ? undefined : { scale: 0.94 }}
      transition={SPRING.snappy}
      {...props}
    />
  );
}
