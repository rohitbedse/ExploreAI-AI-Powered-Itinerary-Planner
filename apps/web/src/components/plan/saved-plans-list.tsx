"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedPlans } from "@/hooks/use-plans";
import { ApiError } from "@/lib/api/client";
import { formatDuration, formatPlanCost } from "@/lib/format";

export function SavedPlansList() {
  const { data, isPending, error } = useSavedPlans();

  if (isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading saved plans">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  if (error) {
    const signedOut = error instanceof ApiError && error.status === 401;
    return (
      <GlassCard role="alert" className="p-5 text-sm">
        {signedOut ? (
          <>
            <Link href="/login" className="font-semibold text-brand underline underline-offset-4">
              Log in
            </Link>{" "}
            to see your saved plans.
          </>
        ) : (
          "We couldn't load your saved plans."
        )}
      </GlassCard>
    );
  }

  if (data.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-muted-foreground">
        Nothing saved yet.{" "}
        <Link href="/" className="font-semibold text-brand underline underline-offset-4">
          Plan something
        </Link>
        .
      </GlassCard>
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((p, i) => (
        <Reveal as="li" key={p.id} trigger="mount" delay={i * 0.05}>
          <Link href={`/plan/${encodeURIComponent(p.id)}`} className="group block rounded-3xl">
            <GlassCard interactive elevation={2} className="flex items-center justify-between gap-4 rounded-3xl p-5">
              <span className="min-w-0 space-y-2">
                <span className="block truncate font-display text-lg font-semibold tracking-tight">{p.title}</span>
                <span className="flex flex-wrap gap-2">
                  <Pill tone="cost">{formatPlanCost(p.summary)}</Pill>
                  <Pill tone="time">{formatDuration(p.summary.total_duration_min)}</Pill>
                  <Pill>{new Date(p.created_at).toLocaleDateString()}</Pill>
                </span>
              </span>
              <ArrowUpRight
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden
              />
            </GlassCard>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}
