"use client";

import { m } from "motion/react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";

const TAGS = { div: m.div, li: m.li, section: m.section, article: m.article, p: m.p } as const;
type Tag = keyof typeof TAGS;

interface RevealProps {
  children: React.ReactNode;
  as?: Tag;
  className?: string;
  delay?: number;
  y?: number;
  /** "mount" animates immediately (streamed content); "view" waits until scrolled into view. */
  trigger?: "mount" | "view";
  "aria-label"?: string;
}

/** Fade-and-rise entrance. Respects prefers-reduced-motion via <MotionConfig reducedMotion="user">. */
export function Reveal({
  children,
  as = "div",
  className,
  delay = 0,
  y = 16,
  trigger = "view",
  "aria-label": ariaLabel,
}: RevealProps) {
  const Comp = TAGS[as];
  const variants = fadeUp(y, delay);
  return trigger === "mount" ? (
    <Comp className={className} aria-label={ariaLabel} variants={variants} initial="hidden" animate="visible">
      {children}
    </Comp>
  ) : (
    <Comp
      className={className}
      aria-label={ariaLabel}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </Comp>
  );
}

/** Wrap a group; direct <StaggerItem> children animate in sequence. */
export function Stagger({
  children,
  className,
  each = 0.07,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  each?: number;
  delay?: number;
}) {
  return (
    <m.div
      className={className}
      variants={staggerContainer(each, delay)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={staggerItem}>
      {children}
    </m.div>
  );
}
