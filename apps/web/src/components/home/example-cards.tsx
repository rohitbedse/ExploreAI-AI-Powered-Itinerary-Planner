"use client";

import { Clock, Wallet } from "lucide-react";
import { useRef } from "react";
import { Reveal } from "@/components/motion/reveal";
import { Pill } from "@/components/ui/pill";
import { EXAMPLES, type Example } from "@/lib/examples";

function ExampleCard({ example, onPick }: { example: Example; onPick: (prompt: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);

  // Pointer position -> CSS variables (tilt + spotlight). Written straight to the element, rAF-throttled,
  // so hover never re-renders React. Touch and reduced-motion users get the static card.
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
    });
  };

  const reset = () => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onPick(example.prompt)}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className="tilt-card glass flex h-full w-full flex-col gap-3 rounded-2xl p-4 text-left shadow-e2"
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-e2"
          style={{ background: example.tile }}
        >
          {example.emoji}
        </span>
        <span className="font-display text-lg font-semibold leading-tight tracking-tight">{example.title}</span>
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">{example.prompt}</span>
      <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Pill tone="cost">
          <Wallet className="size-3.5" aria-hidden />
          <span className="sr-only">Budget </span>
          {example.budget}
        </Pill>
        <Pill tone="time">
          <Clock className="size-3.5" aria-hidden />
          <span className="sr-only">Time </span>
          {example.time}
        </Pill>
      </span>
    </button>
  );
}

export function ExampleCards({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <section aria-label="Try an example">
      <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Or start from an idea
      </h2>
      <div role="group" aria-label="Example prompts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {EXAMPLES.map((ex, i) => (
          <Reveal key={ex.id} delay={i * 0.08} y={22}>
            <ExampleCard example={ex} onPick={onPick} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
