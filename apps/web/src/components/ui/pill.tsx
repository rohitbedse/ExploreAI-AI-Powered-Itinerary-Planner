import { TONE, type Tone } from "@/components/ui/animated-chip";
import { cn } from "@/lib/utils";

/** Static semantic badge: cost = emerald, time = sky, travel = amber, rating = yellow. */
export function Pill({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium", TONE[tone], className)}
      {...props}
    />
  );
}
