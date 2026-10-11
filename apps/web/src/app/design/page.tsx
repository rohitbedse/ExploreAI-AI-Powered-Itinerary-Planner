import type { Metadata } from "next";
import { Showcase } from "@/components/design/showcase";
import { ThemePanel } from "@/components/design/theme-panel";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-h1">Design system</h1>
        <p className="text-muted-foreground">
          Every token and primitive, rendered in both themes. Toggle the page theme in the header to check the
          surrounding chrome; the two panels below are pinned to their own theme.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePanel theme="light">
          <Showcase />
        </ThemePanel>
        <ThemePanel theme="dark">
          <Showcase />
        </ThemePanel>
      </div>
    </div>
  );
}
