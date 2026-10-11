import { cn } from "@/lib/utils";

/** Placeholder block with a moving highlight (static for reduced-motion users). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("shimmer rounded-lg", className)} {...props} />;
}
