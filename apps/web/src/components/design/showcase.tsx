"use client";

import { Clock, Footprints, Heart, Sparkles, Star, Wallet } from "lucide-react";
import { useState } from "react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { AnimatedChip } from "@/components/ui/animated-chip";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Aurora } from "@/components/ui/aurora";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowButton } from "@/components/ui/glow-button";
import { GradientText } from "@/components/ui/gradient-text";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </div>
  );
}

const SWATCHES = [
  ["Indigo", "var(--brand-indigo)"],
  ["Violet", "var(--brand-violet)"],
  ["Pink", "var(--brand-pink)"],
  ["Amber", "var(--brand-amber)"],
] as const;

/** One full pass over every token and primitive. Rendered once per theme on /design. */
export function Showcase() {
  const [replay, setReplay] = useState(0);
  const [on, setOn] = useState(false);

  return (
    <div className="space-y-9">
      <div className="relative -mx-5 -mt-5 overflow-hidden px-5 py-10 text-center sm:-mx-7 sm:-mt-7 sm:px-7">
        <Aurora contained />
        <div className="relative space-y-3">
          <Pill tone="brand" className="mx-auto">
            <Sparkles className="size-3.5" aria-hidden /> Aurora background
          </Pill>
          <p className="font-display text-display text-balance">
            Warm <GradientText flow>aurora</GradientText>
          </p>
        </div>
      </div>

      <Block title="Brand gradient" note="indigo → violet → pink → amber">
        <div className="h-14 rounded-2xl shadow-e2" style={{ background: "var(--gradient-brand)" }} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SWATCHES.map(([name, color]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className="size-6 rounded-full shadow-e1" style={{ background: color }} />
              {name}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Semantic colors" note="cost · time · travel · rating">
        <div className="flex flex-wrap gap-2">
          <Pill tone="cost">
            <Wallet className="size-3.5" aria-hidden /> ₹350
          </Pill>
          <Pill tone="time">
            <Clock className="size-3.5" aria-hidden /> 2 h 15 min
          </Pill>
          <Pill tone="travel">
            <Footprints className="size-3.5" aria-hidden /> 9 min walk
          </Pill>
          <Pill tone="rating">
            <Star className="size-3.5 fill-current" aria-hidden /> 4.6
          </Pill>
          <Pill tone="brand">Brand</Pill>
          <Pill>Neutral</Pill>
        </div>
      </Block>

      <Block title="Typography" note="Fraunces for display, Plus Jakarta Sans for UI; fluid via clamp()">
        <div className="space-y-2">
          <p className="font-display text-display">Display</p>
          <p className="font-display text-h1">Heading one</p>
          <p className="font-display text-h2">Heading two</p>
          <p className="text-lead text-muted-foreground">Lead paragraph, relaxed and readable at any width.</p>
          <p>Body text in Plus Jakarta Sans. Never pure black: #1C1917 on #FAF8F5.</p>
        </div>
      </Block>

      <Block title="Radius + elevation" note="Radius 10 / 14 / 20 / 24 / 28 px. Four shadow levels.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([1, 2, 3, 4] as const).map((lvl) => (
            <div
              key={lvl}
              className={`flex h-20 items-center justify-center rounded-2xl border bg-card text-sm font-semibold shadow-e${lvl}`}
            >
              e{lvl}
            </div>
          ))}
        </div>
      </Block>

      <Block title="GlassCard" note="Blur + 1px translucent border + inner highlight">
        <div className="relative overflow-hidden rounded-3xl p-6">
          <Aurora contained />
          <div className="relative grid gap-3 sm:grid-cols-2">
            <GlassCard className="p-4">Static glass card</GlassCard>
            <GlassCard interactive glow elevation={3} className="p-4">
              Interactive + glow (hover me)
            </GlassCard>
          </div>
        </div>
      </Block>

      <Block title="GlowButton" note="Animated gradient border, shimmer on hover, press scale">
        <div className="flex flex-wrap items-center gap-3">
          <GlowButton>
            <Sparkles className="size-4" aria-hidden /> Plan my day
          </GlowButton>
          <GlowButton size="sm">Small</GlowButton>
          <GlowButton disabled>Disabled</GlowButton>
        </div>
      </Block>

      <Block title="Buttons + inputs">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Normal input" aria-label="Normal input" />
          <Input placeholder="Invalid input" aria-label="Invalid input" aria-invalid="true" />
        </div>
      </Block>

      <Block title="AnimatedChip" note="Spring hover lift and tap squish; tones match the semantic colors">
        <div className="flex flex-wrap gap-2">
          <AnimatedChip>Neutral</AnimatedChip>
          <AnimatedChip tone="brand" aria-pressed={on} onClick={() => setOn((v) => !v)}>
            <Heart className={on ? "size-4 fill-current" : "size-4"} aria-hidden /> {on ? "Liked" : "Like"}
          </AnimatedChip>
          <AnimatedChip tone="cost">Cheaper</AnimatedChip>
          <AnimatedChip tone="travel">Less walking</AnimatedChip>
          <AnimatedChip tone="time">Swap this stop</AnimatedChip>
          <AnimatedChip disabled>Disabled</AnimatedChip>
        </div>
      </Block>

      <Block title="Skeleton" note="Shimmer; static under reduced motion">
        <GlassCard elevation={1} className="flex gap-4 p-5">
          <Skeleton className="size-10 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2 rounded-full" />
          </div>
        </GlassCard>
      </Block>

      <Block title="AnimatedNumber" note="Counts up; screen readers get the final value only">
        <div className="flex flex-wrap items-center gap-6">
          <p className="font-display text-h1" key={replay}>
            <AnimatedNumber value={1250} format={(n) => formatMoney(Math.max(n, 1))} />
          </p>
          <p className="font-display text-h1" key={`b${replay}`}>
            <AnimatedNumber value={187} format={(n) => `${n} min`} duration={1300} />
          </p>
          <Button variant="outline" size="sm" onClick={() => setReplay((n) => n + 1)}>
            Replay
          </Button>
        </div>
      </Block>

      <Block title="Reveal + Stagger" note="Scroll-triggered entrances; opacity-only under reduced motion">
        <Stagger className="grid gap-3 sm:grid-cols-3" each={0.09}>
          {["One", "Two", "Three"].map((n) => (
            <StaggerItem key={n}>
              <GlassCard className="p-4 text-center font-display text-h2">{n}</GlassCard>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal>
          <GlassCard className="p-4 text-sm text-muted-foreground">A single Reveal wrapper, fading up on scroll.</GlassCard>
        </Reveal>
      </Block>
    </div>
  );
}
