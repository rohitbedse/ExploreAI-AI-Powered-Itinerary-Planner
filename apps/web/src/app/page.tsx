import { BlurWords } from "@/components/home/blur-words";
import { HeroBackdrop } from "@/components/home/hero-backdrop";
import { HowItWorks } from "@/components/home/how-it-works";
import { PromptComposer } from "@/components/home/prompt-composer";
import { TrustStrip } from "@/components/home/trust-strip";
import { Reveal } from "@/components/motion/reveal";
import { ShimmerPill } from "@/components/ui/shimmer-pill";

export default function Home() {
  return (
    <div className="relative">
      <HeroBackdrop />

      <section aria-label="Plan a day out" className="mx-auto max-w-5xl pt-4 sm:pt-12">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <Reveal trigger="mount" y={10}>
            <ShimmerPill>
              <span aria-hidden="true">✨</span> AI day planner · 100% real places
            </ShimmerPill>
          </Reveal>
          <h1 className="font-display text-display text-balance">
            <BlurWords
              parts={[{ text: "Plan a day out" }, { text: "in seconds.", gradient: true }]}
              delay={0.15}
            />
          </h1>
          <Reveal trigger="mount" delay={0.75} y={12}>
            <p className="mx-auto max-w-xl text-lead text-muted-foreground text-balance">
              Tell us your budget, time and mood. Get a timed, costed, mapped itinerary built from places that
              actually exist.
            </p>
          </Reveal>
        </div>

        <Reveal trigger="mount" delay={0.95} y={24} className="mt-10 sm:mt-12">
          <PromptComposer />
        </Reveal>
      </section>

      <HowItWorks />
      <TrustStrip />
    </div>
  );
}
