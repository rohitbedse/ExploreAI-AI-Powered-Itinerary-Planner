import { Clock, Footprints, Wallet, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { Tone } from "@/components/ui/animated-chip";
import { GlassCard } from "@/components/ui/glass-card";
import { formatDuration, formatMoney, formatPlanCost } from "@/lib/format";
import type { Plan } from "@/lib/types";

const TEXT: Record<Tone, string> = {
  neutral: "",
  brand: "text-brand",
  cost: "text-cost",
  time: "text-time",
  travel: "text-travel",
  rating: "text-rating",
  mood: "text-mood",
};

export function PlanSummary({ summary, notes = [] }: { summary: Plan["summary"]; notes?: string[] }) {
  const { currency } = summary;
  // Unknown prices are shown as text, never animated from or to 0 (unknown is not free).
  const costUnknown = summary.cost_status === "unknown";
  const items: { label: string; value: number; format: (n: number) => string; tone: Tone; Icon: LucideIcon }[] = [
    {
      label: summary.cost_status === "known" || summary.cost_status === undefined ? "Total cost" : "Known cost",
      value: summary.total_cost,
      // Zero reads "Free"; avoid flashing that word while counting up from 0.
      format: (n) =>
        n === summary.total_cost ? formatPlanCost(summary) : formatMoney(Math.max(n, 1), currency),
      tone: "cost",
      Icon: Wallet,
    },
    { label: "Total time", value: summary.total_duration_min, format: formatDuration, tone: "time", Icon: Clock },
    { label: "Travel time", value: summary.total_travel_min, format: formatDuration, tone: "travel", Icon: Footprints },
  ];

  return (
    <GlassCard as="section" aria-label="Plan summary" elevation={3} className="rounded-3xl p-4 sm:p-6">
      <dl className="grid grid-cols-3 gap-2 text-center sm:gap-4">
        {items.map(({ label, value, format, tone, Icon }) => (
          <div key={label} className="space-y-1">
            <dt className={`flex items-center justify-center gap-1.5 text-xs font-medium sm:text-sm ${TEXT[tone]}`}>
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
              {label.endsWith("cost") && costUnknown ? (
                <span className="text-base sm:text-xl">Price unknown</span>
              ) : (
                <AnimatedNumber value={value} format={format} />
              )}
            </dd>
          </div>
        ))}
      </dl>
      {(summary.budget_note || notes.length > 0) && (
        <ul className="mt-4 space-y-1 text-left text-xs text-muted-foreground sm:text-sm" aria-label="Plan notes">
          {summary.budget_note && <li>{summary.budget_note}</li>}
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
