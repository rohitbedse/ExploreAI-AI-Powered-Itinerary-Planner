import { Gift, Map, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";

const ITEMS = [
  { Icon: Map, text: "Powered by OpenStreetMap" },
  { Icon: ShieldCheck, text: "No ads" },
  { Icon: Gift, text: "Free" },
];

export function TrustStrip() {
  return (
    <Reveal className="mt-20 flex justify-center">
      <ul
        aria-label="Why you can trust ExploreAI"
        className="glass flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full px-6 py-3 text-sm font-medium"
      >
        {ITEMS.map(({ Icon, text }, i) => (
          <li key={text} className="flex items-center gap-3">
            {i > 0 && (
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Icon className="size-4 text-brand" aria-hidden />
              {text}
            </span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
