import { cn } from "@/lib/utils";

/**
 * Forces a subtree to one theme regardless of the page theme. This works because every
 * component reads CSS variables (`.light` / `.dark` redefine them); no `dark:` variants are used.
 */
export function ThemePanel({
  theme,
  className,
  children,
}: {
  theme: "light" | "dark";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`${theme === "light" ? "Light" : "Dark"} theme`}
      className={cn(theme, "relative isolate overflow-hidden rounded-3xl border bg-background p-5 text-foreground sm:p-7", className)}
    >
      {children}
    </section>
  );
}
