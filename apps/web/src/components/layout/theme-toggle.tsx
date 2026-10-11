"use client";

import { useId, useSyncExternalStore } from "react";

// Keep in sync with THEME_INIT_SCRIPT in app/layout.tsx.
const KEY = "exploreai:theme";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

interface ViewTransitionLike {
  ready: Promise<void>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

/** Sun that morphs into a moon: the core grows while a second circle bites a crescent out of it. */
function ThemeIcon({ dark }: { dark: boolean }) {
  const maskId = `moon-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="theme-icon" data-dark={dark} aria-hidden="true" fill="none">
      <mask id={maskId}>
        <rect width="24" height="24" fill="white" />
        <circle className="moon-cut" cx="12" cy="12" r="5.5" fill="black" />
      </mask>
      <circle className="sun-core" cx="12" cy="12" r="5" fill="currentColor" mask={`url(#${maskId})`} />
      <g className="sun-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line key={deg} x1="12" y1="2" x2="12" y2="4" transform={`rotate(${deg} 12 12)`} />
        ))}
      </g>
    </svg>
  );
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  const apply = (next: boolean) => {
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
  };

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = !dark;
    const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!start || reduce) {
      apply(next);
      return;
    }

    // Circle reveal growing from the toggle (keyboard activation reports 0,0: use the button's centre).
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || rect.left + rect.width / 2;
    const y = e.clientY || rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = start.call(document, () => apply(next));
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ThemeIcon dark={dark} />
    </button>
  );
}
