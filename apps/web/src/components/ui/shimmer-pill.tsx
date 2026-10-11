import { cn } from "@/lib/utils";

/** Announcement pill with a light sweep travelling around its border. */
export function ShimmerPill({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "shimmer-border glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold",
        className,
      )}
      {...props}
    />
  );
}
