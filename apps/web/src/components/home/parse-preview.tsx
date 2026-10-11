"use client";

import { Clock, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Pill } from "@/components/ui/pill";
import type { Tone } from "@/components/ui/animated-chip";
import { SPRING } from "@/lib/motion";
import type { DetectedTag } from "@/lib/parse-prompt";

const KINDS: Record<DetectedTag["kind"], { tone: Tone; Icon: LucideIcon; name: string }> = {
  budget: { tone: "cost", Icon: Wallet, name: "Budget" },
  time: { tone: "time", Icon: Clock, name: "Time" },
  group: { tone: "brand", Icon: Users, name: "Group" },
  mood: { tone: "mood", Icon: Sparkles, name: "Mood" },
};

/**
 * "Here's what we picked up" tags, parsed client-side as the user types. Tags spring in when first
 * detected. The region is a polite live region so assistive tech hears new detections.
 */
export function ParsePreview({ tags }: { tags: DetectedTag[] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Detected from your request"
      className="flex min-h-9 flex-wrap items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {tags.length > 0 && (
          <m.span
            key="lead"
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Understood:
          </m.span>
        )}
        {tags.map((t) => {
          const { tone, Icon, name } = KINDS[t.kind];
          return (
            <m.span
              key={t.key}
              initial={{ opacity: 0, scale: 0.5, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={SPRING.bouncy}
            >
              <Pill tone={tone}>
                <Icon className="size-3.5" aria-hidden />
                <span className="sr-only">{name}: </span>
                {t.label}
              </Pill>
            </m.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
