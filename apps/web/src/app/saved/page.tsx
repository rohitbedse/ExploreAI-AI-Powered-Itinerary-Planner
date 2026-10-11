import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { SavedPlansList } from "@/components/plan/saved-plans-list";

export const metadata: Metadata = { title: "Saved plans" };

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <Reveal trigger="mount">
        <h1 className="font-display text-h1">Saved plans</h1>
      </Reveal>
      <SavedPlansList />
    </div>
  );
}
