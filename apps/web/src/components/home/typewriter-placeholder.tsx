"use client";

import { useTypewriter } from "@/hooks/use-typewriter";

/**
 * Typewriter "placeholder" drawn over an empty textarea. It's aria-hidden decoration (the textarea
 * keeps its real <label>), isolated in its own component so each keystroke re-renders only this span.
 */
export function TypewriterPlaceholder({ phrases, active }: { phrases: readonly string[]; active: boolean }) {
  const text = useTypewriter(phrases, active);
  if (!active) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1 right-14 top-1 text-base leading-relaxed text-muted-foreground/75"
    >
      {text}
      <span className="caret" />
    </span>
  );
}
