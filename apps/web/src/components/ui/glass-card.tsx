import { cn } from "@/lib/utils";

type Elevation = 1 | 2 | 3 | 4;

const SHADOW: Record<Elevation, string> = {
  1: "shadow-e1",
  2: "shadow-e2",
  3: "shadow-e3",
  4: "shadow-e4",
};

interface Props extends React.ComponentProps<"div"> {
  as?: "div" | "article" | "section";
  elevation?: Elevation;
  /** Lift + stronger shadow on hover; for clickable cards. */
  interactive?: boolean;
  /** Brand-colored ring and glow, e.g. a selected card. */
  glow?: boolean;
}

/** Frosted surface: translucent fill, hairline border, inner top highlight. */
export function GlassCard({ as: Tag = "div", elevation = 2, interactive, glow, className, ...props }: Props) {
  return (
    <Tag
      className={cn(
        "glass rounded-2xl",
        SHADOW[elevation],
        interactive &&
          "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        glow && "ring-2 ring-ring/60 shadow-[0_0_32px_-6px_var(--glow-shadow)]",
        className,
      )}
      {...props}
    />
  );
}
