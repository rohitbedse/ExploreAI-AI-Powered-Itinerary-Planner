"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Reveal } from "@/components/motion/reveal";
import { BottomSheet } from "@/components/plan/bottom-sheet";
import { ChangePlanBar } from "@/components/plan/change-plan-bar";
import { PlanMap } from "@/components/plan/plan-map";
import { PlanSkeleton, StopSkeleton } from "@/components/plan/plan-skeleton";
import { PlanSummary } from "@/components/plan/plan-summary";
import { StreamProgress } from "@/components/plan/stream-progress";
import { TimelineCard } from "@/components/plan/timeline-card";
import { TravelLegRow } from "@/components/plan/travel-leg-row";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePlanStream } from "@/hooks/use-plan-stream";
import { keys, usePlan, useSavePlan } from "@/hooks/use-plans";
import { ApiError } from "@/lib/api/client";
import { pendingRequest } from "@/lib/storage";
import type { Plan, PlanRequest, ReviseRequest } from "@/lib/types";

const EXPECTED_STOPS = 3; // skeleton count while the first stops stream in

export function PlanView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isNew = id === "new";
  const query = usePlan(id, !isNew);
  const save = useSavePlan();
  const { state, start } = usePlanStream();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [request, setRequest] = useState<PlanRequest | null>(null);
  const [basePlan, setBasePlan] = useState<Plan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const onComplete = useCallback(
    (plan: Plan) => {
      setBasePlan(plan);
      qc.setQueryData(keys.plan(plan.id), plan);
      pendingRequest.clear();
      // Swap /plan/new for the permanent URL without remounting (keeps stream state + map).
      window.history.replaceState(null, "", `/plan/${encodeURIComponent(plan.id)}`);
    },
    [qc],
  );

  const runInitial = useCallback(
    (req: PlanRequest) => start("/plans/stream", req, onComplete),
    [start, onComplete],
  );

  useEffect(() => {
    if (!isNew) return;
    const req = pendingRequest.peek();
    if (!req) {
      router.replace("/");
      return;
    }
    setRequest(req);
    void runInitial(req);
  }, [isNew, router, runInitial]);

  const streaming = state.phase === "streaming";
  const plan = state.plan ?? basePlan ?? query.data ?? null;
  const showLive = streaming && state.stops.length > 0;
  const stops = showLive ? state.stops : (plan?.stops ?? []);
  const legs = showLive ? state.legs : (plan?.legs ?? []);
  const selected = stops.find((s) => s.id === selectedId) ?? null;
  const currency = plan?.summary.currency ?? "INR";
  const loadingExisting = !isNew && query.isPending;
  const loadError = !isNew && query.isError ? query.error : null;

  const revise = (req: ReviseRequest) => {
    if (!plan) return;
    setSelectedId(null);
    void start(`/plans/${encodeURIComponent(plan.id)}/revise/stream`, req, onComplete);
  };

  const map = (
    <PlanMap stops={stops} legs={legs} selectedId={selectedId} onSelect={setSelectedId} />
  );

  return (
    <div className="gap-6 pb-20 lg:grid lg:grid-cols-2 lg:pb-0">
      <div className="min-w-0 space-y-4">
        <header className="space-y-2">
          <h1 className="font-display text-h1 text-balance">
            {plan?.title ?? (loadError ? "Plan unavailable" : "Planning your day…")}
          </h1>
          {(plan?.prompt ?? request?.prompt) && (
            <p className="text-muted-foreground">“{plan?.prompt ?? request?.prompt}”</p>
          )}
          {plan && !streaming && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => save.mutate(plan.id)}
              disabled={save.isPending || plan.saved}
            >
              {plan.saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
              {plan.saved ? "Saved" : "Save plan"}
            </Button>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof ApiError && save.error.status === 401 ? (
                <>
                  <Link href="/login" className="font-semibold text-brand underline underline-offset-4">
                    Log in
                  </Link>{" "}
                  to save plans.
                </>
              ) : (
                "Couldn't save the plan. Try again."
              )}
            </p>
          )}
        </header>

        {streaming && <StreamProgress steps={state.steps} />}

        {state.phase === "error" && (
          <GlassCard role="alert" className="flex items-start gap-3 border-destructive/40 p-4 text-sm">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
            <div className="space-y-3">
              <p>{state.error}</p>
              {request && !plan && (
                <Button size="sm" onClick={() => void runInitial(request)}>
                  Try again
                </Button>
              )}
            </div>
          </GlassCard>
        )}

        {loadError && (
          <GlassCard role="alert" className="border-destructive/40 p-4 text-sm">
            {loadError instanceof ApiError && loadError.status === 404
              ? "We couldn't find that plan."
              : "We couldn't load this plan right now."}{" "}
            <Link href="/" className="font-semibold text-brand underline underline-offset-4">
              Start a new plan
            </Link>
          </GlassCard>
        )}

        {loadingExisting && <PlanSkeleton />}

        <ol aria-label="Itinerary" className="space-y-0">
          {stops.map((stop, i) => {
            const leg = i > 0 ? legs.find((l) => l.from_stop_id === stops[i - 1].id && l.to_stop_id === stop.id) : undefined;
            return (
              <Fragment key={stop.id}>
                {leg && (
                  <Reveal as="li" trigger="mount" y={8} aria-label="Travel">
                    <TravelLegRow leg={leg} />
                  </Reveal>
                )}
                <Reveal as="li" trigger="mount" className={i > 0 && !leg ? "mt-3" : undefined}>
                  <TimelineCard
                    stop={stop}
                    index={i}
                    currency={currency}
                    selected={stop.id === selectedId}
                    onSelect={(sid) => setSelectedId((cur) => (cur === sid ? null : sid))}
                  />
                </Reveal>
              </Fragment>
            );
          })}
        </ol>

        {streaming && (
          <div className="space-y-3" data-testid="plan-skeleton" aria-hidden>
            {Array.from({ length: Math.max(0, EXPECTED_STOPS - state.stops.length) }, (_, i) => (
              <StopSkeleton key={i} />
            ))}
          </div>
        )}

        {plan && !streaming && (
          <>
            <PlanSummary summary={plan.summary} notes={plan.notes} />
            <ChangePlanBar
              disabled={streaming}
              selectedStopId={selected?.id ?? null}
              selectedStopName={selected?.name ?? null}
              onRevise={revise}
            />
          </>
        )}

        <p className="sr-only" role="status">
          {state.phase === "complete" ? `Plan ready with ${stops.length} stops.` : ""}
        </p>
      </div>

      {isDesktop === true && (
        <div className="glass sticky top-24 h-[calc(100vh-8rem)] overflow-hidden rounded-3xl shadow-e3">{map}</div>
      )}
      {isDesktop === false && <BottomSheet>{map}</BottomSheet>}
    </div>
  );
}
