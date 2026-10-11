import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";

export function StopSkeleton() {
  return (
    <GlassCard elevation={1} className="flex gap-4 p-5" aria-hidden>
      <Skeleton className="size-10 shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </GlassCard>
  );
}

export function PlanSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" data-testid="plan-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <StopSkeleton key={i} />
      ))}
    </div>
  );
}
