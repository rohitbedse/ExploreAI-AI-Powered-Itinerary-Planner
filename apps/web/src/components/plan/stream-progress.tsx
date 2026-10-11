import { Check, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { StepState } from "@/lib/plan-stream";

/** Live checklist of pipeline steps; screen readers hear each new step via the live region. */
export function StreamProgress({ steps }: { steps: StepState[] }) {
  return (
    <GlassCard elevation={2} className="p-4">
      <ol aria-live="polite" aria-label="Planning progress" className="space-y-2 text-sm">
        {steps.length === 0 && <li className="text-muted-foreground">Starting…</li>}
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5">
            {s.status === "done" ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-cost-soft text-cost">
                <Check className="size-3.5" aria-hidden />
              </span>
            ) : (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              </span>
            )}
            <span className={s.status === "done" ? "text-muted-foreground" : "font-semibold"}>
              {s.message}
              <span className="sr-only">{s.status === "done" ? " (done)" : " (in progress)"}</span>
            </span>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}
