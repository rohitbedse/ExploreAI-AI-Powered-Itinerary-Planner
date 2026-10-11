import type { Transition, Variants } from "motion/react";

type Bezier = [number, number, number, number];

/** Shared easing curves. Keep in sync with --ease-* in globals.css. */
export const EASE = {
  outExpo: [0.16, 1, 0.3, 1] as Bezier, // default for entrances: fast start, long settle
  outQuart: [0.25, 1, 0.5, 1] as Bezier,
  inOut: [0.65, 0, 0.35, 1] as Bezier,
  emphasized: [0.2, 0, 0, 1] as Bezier,
};

export const DURATION = { fast: 0.18, base: 0.35, slow: 0.65 } as const;

/** Spring presets. `press` for taps, `snappy` for UI, `soft` for large moves, `bouncy` for delight. */
export const SPRING = {
  press: { type: "spring", stiffness: 600, damping: 30 },
  snappy: { type: "spring", stiffness: 500, damping: 32, mass: 0.8 },
  soft: { type: "spring", stiffness: 220, damping: 26 },
  bouncy: { type: "spring", stiffness: 380, damping: 18 },
} satisfies Record<string, Transition>;

/** Fade + rise. Reduced-motion users get opacity only (see MotionConfig in providers). */
export const fadeUp = (y = 16, delay = 0): Variants => ({
  hidden: { opacity: 0, y },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.outExpo, delay } },
});

/** Parent variant that staggers `staggerItem` children. */
export const staggerContainer = (each = 0.07, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: each, delayChildren } },
});

export const staggerItem: Variants = fadeUp(14);

/** Delay for the i-th item of a manually staggered list. */
export const stagger = (index: number, each = 0.06, base = 0) => base + index * each;
