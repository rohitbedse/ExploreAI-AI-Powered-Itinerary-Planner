"use client";

import { Loader2 } from "lucide-react";
import { AnimatePresence, m, type HTMLMotionProps } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Props extends Omit<HTMLMotionProps<"button">, "children"> {
  children?: React.ReactNode;
  size?: "default" | "sm";
  /** "ink": dark fill + gradient border (default). "gradient": animated brand-gradient fill. */
  variant?: "ink" | "gradient";
  /** Leading icon while idle; morphs into a spinner while `loading`. Give it the `sparkle` class to spin on hover. */
  icon?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  /**
   * Looks disabled but stays focusable and clickable (aria-disabled), so a tooltip can explain why
   * and the click can still surface validation. Real `disabled` is for truly inert buttons.
   */
  softDisabled?: boolean;
}

const MORPH = {
  initial: { opacity: 0, scale: 0.4, rotate: -90 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.4, rotate: 90 },
  transition: SPRING.snappy,
};

/**
 * Primary call-to-action: animated gradient border, shimmer sweep on hover, spring press, and
 * an icon<->spinner morph for the loading state. Border/shimmer animations are CSS (globals.css).
 */
export function GlowButton({
  className,
  size = "default",
  variant = "ink",
  icon,
  loading = false,
  loadingLabel,
  softDisabled = false,
  type = "button",
  children,
  onClick,
  ...props
}: Props) {
  const inert = props.disabled || loading;
  const looksDisabled = props.disabled || softDisabled;

  return (
    <m.button
      type={type}
      className={cn("glow-btn", className)}
      data-size={size}
      data-variant={variant}
      aria-disabled={softDisabled || loading ? true : undefined}
      aria-busy={loading || undefined}
      // While loading, swallow clicks so a double-tap can't submit twice.
      onClick={loading ? (e) => e.preventDefault() : onClick}
      whileTap={inert || looksDisabled ? undefined : { scale: 0.96 }}
      whileHover={inert || looksDisabled ? undefined : { scale: 1.02 }}
      transition={SPRING.press}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <m.span key="spinner" className="inline-flex" {...MORPH}>
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          </m.span>
        ) : icon ? (
          <m.span key="icon" className="inline-flex" {...MORPH}>
            {icon}
          </m.span>
        ) : null}
      </AnimatePresence>
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </m.button>
  );
}
