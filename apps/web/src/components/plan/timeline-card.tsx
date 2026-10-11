import { Clock, Star, Wallet } from "lucide-react";
import { WhyTooltip } from "@/components/plan/why-tooltip";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { formatClock, formatDuration, formatStopCost } from "@/lib/format";
import type { PlanStop } from "@/lib/types";

interface Props {
  stop: PlanStop;
  index: number;
  currency: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function TimelineCard({ stop, index, currency, selected, onSelect }: Props) {
  return (
    <GlassCard
      as="article"
      aria-label={`Stop ${index + 1}: ${stop.name}`}
      elevation={selected ? 3 : 2}
      glow={selected}
      interactive
      className="p-4 sm:p-5"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-e2"
          style={{ background: "var(--gradient-deep)" }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">
            <time dateTime={stop.start} className="font-semibold text-foreground">
              {formatClock(stop.start)}
            </time>{" "}
            · <span className="capitalize">{stop.category}</span>
          </p>
          <h3 className="font-display text-xl font-semibold leading-snug tracking-tight">
            <button
              type="button"
              onClick={() => onSelect(stop.id)}
              aria-pressed={selected}
              title="Select to show on the map or swap"
              className="rounded-lg text-left decoration-brand-violet decoration-2 underline-offset-4 hover:underline"
            >
              {stop.name}
            </button>
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Details">
            {stop.rating != null && (
              <li>
                <Pill tone="rating">
                  <Star className="size-3.5 fill-current" aria-hidden />
                  <span className="sr-only">Rating </span>
                  {stop.rating.toFixed(1)}
                </Pill>
              </li>
            )}
            <li>
              <Pill tone="cost">
                <Wallet className="size-3.5" aria-hidden />
                <span className="sr-only">Cost </span>
                {formatStopCost(stop.cost, currency)}
              </Pill>
            </li>
            <li>
              <Pill tone="time">
                <Clock className="size-3.5" aria-hidden />
                <span className="sr-only">Duration </span>
                {formatDuration(stop.duration_min)}
              </Pill>
            </li>
          </ul>
          <div className="mt-2.5">
            <WhyTooltip text={stop.why} stopName={stop.name} />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
