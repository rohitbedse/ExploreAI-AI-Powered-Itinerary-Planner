import { cn } from "@/lib/utils";

interface Props extends React.ComponentProps<"span"> {
  /** Slowly drifts the gradient. Off by default; disabled for reduced-motion users in CSS. */
  flow?: boolean;
}

/** Brand-gradient text. Use for large display type only (stops are tuned for >= 3:1 at large sizes). */
export function GradientText({ className, flow = false, ...props }: Props) {
  return <span className={cn("gradient-text", className)} data-flow={flow || undefined} {...props} />;
}
