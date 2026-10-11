"use client";

import { Fragment } from "react";
import { m, useReducedMotion, type Variants } from "motion/react";
import { GradientText } from "@/components/ui/gradient-text";
import { EASE } from "@/lib/motion";

export interface HeadlinePart {
  text: string;
  /** Rendered as one animated-gradient unit instead of word by word. */
  gradient?: boolean;
}

const unit: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(14px)" },
  visible: (custom: { i: number; delay: number; each: number }) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE.outExpo, delay: custom.delay + custom.i * custom.each },
  }),
};

/**
 * Headline whose words resolve from blur to sharp in a stagger. The animated spans are
 * aria-hidden and a plain sr-only copy carries the text, so screen readers read one sentence.
 * Reduced motion: renders the final text with no animation.
 */
export function BlurWords({
  parts,
  delay = 0.1,
  each = 0.07,
}: {
  parts: HeadlinePart[];
  delay?: number;
  each?: number;
}) {
  const reduce = useReducedMotion();
  const units = parts.flatMap((p) => (p.gradient ? [p] : p.text.split(" ").map((w) => ({ text: w }) as HeadlinePart)));
  const full = parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim();

  const content = (u: HeadlinePart) => (u.gradient ? <GradientText flow>{u.text}</GradientText> : u.text);

  return (
    <>
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">
        {units.map((u, i) => (
          <Fragment key={i}>
            {reduce ? (
              <span className="inline-block">{content(u)}</span>
            ) : (
              <m.span
                className="inline-block will-change-[transform,filter]"
                variants={unit}
                custom={{ i, delay, each }}
                initial="hidden"
                animate="visible"
              >
                {content(u)}
              </m.span>
            )}
            {i < units.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </>
  );
}
