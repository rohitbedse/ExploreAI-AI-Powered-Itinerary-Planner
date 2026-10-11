import { cn } from "@/lib/utils";

/** Keyboard-key styled label. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd className={cn("kbd", className)} {...props} />;
}
