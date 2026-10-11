import { Bike, Bus, Car, Footprints, type LucideIcon } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { formatDistance, formatDuration } from "@/lib/format";
import type { TravelLeg } from "@/lib/types";

const MODES: Record<TravelLeg["mode"], { Icon: LucideIcon; verb: string }> = {
  walk: { Icon: Footprints, verb: "walk" },
  bike: { Icon: Bike, verb: "bike" },
  transit: { Icon: Bus, verb: "transit" },
  drive: { Icon: Car, verb: "drive" },
};

export function TravelLegRow({ leg }: { leg: TravelLeg }) {
  const { Icon, verb } = MODES[leg.mode];
  return (
    <div className="relative ml-[1.35rem] flex items-center py-1 pl-8">
      {/* Gradient connector between the numbered badges */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 rounded-full opacity-60"
        style={{ background: "var(--gradient-deep)" }}
      />
      <Pill tone="travel" className="text-[0.8125rem]">
        <Icon className="size-3.5" aria-hidden />
        <span>
          {formatDuration(leg.duration_min)} {verb} · {formatDistance(leg.distance_m)}
        </span>
      </Pill>
    </div>
  );
}
