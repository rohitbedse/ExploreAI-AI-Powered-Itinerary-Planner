import { MapPinned, PenLine, Route, type LucideIcon } from "lucide-react";
import { StepLine } from "@/components/home/step-line";
import { Reveal } from "@/components/motion/reveal";

const STEPS: { n: string; Icon: LucideIcon; title: string; body: string; tile: string }[] = [
  {
    n: "01",
    Icon: PenLine,
    title: "Describe",
    body: "Budget, time, mood and who's coming, in plain words or by voice.",
    tile: "linear-gradient(135deg, #4f46e5, #7c3aed)",
  },
  {
    n: "02",
    Icon: MapPinned,
    title: "We search real places",
    body: "Every candidate comes straight from OpenStreetMap. Nothing is made up.",
    tile: "linear-gradient(135deg, #7c3aed, #db2777)",
  },
  {
    n: "03",
    Icon: Route,
    title: "Get a timed route",
    body: "Stops, travel legs and costs on a map. Tweak it with one tap.",
    tile: "linear-gradient(135deg, #db2777, #d97706)",
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      className="mx-auto mt-24 max-w-5xl [contain-intrinsic-size:auto_28rem] [content-visibility:auto]"
    >
      <Reveal className="space-y-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Three steps</p>
        <h2 id="how-title" className="font-display text-h1">
          How it works
        </h2>
      </Reveal>

      <div className="relative mt-12">
        {/* Connecting line: behind the icon tiles, horizontal on md+, vertical on mobile. */}
        <StepLine orientation="horizontal" className="absolute left-[16.7%] right-[16.7%] top-7 hidden h-0.5 md:block" />
        <StepLine orientation="vertical" className="absolute bottom-10 left-7 top-7 w-0.5 -translate-x-1/2 md:hidden" />

        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map(({ n, Icon, title, body, tile }, i) => (
            <Reveal as="li" key={n} delay={0.15 + i * 0.18} className="flex gap-5 md:flex-col md:items-center md:text-center">
              <span
                aria-hidden
                className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-e3 ring-4 ring-background"
                style={{ background: tile }}
              >
                <Icon className="size-6" />
              </span>
              <div className="space-y-1.5">
                <p className="text-xs font-bold tracking-widest text-muted-foreground">STEP {n}</p>
                <h3 className="font-display text-h2">{title}</h3>
                <p className="max-w-xs text-muted-foreground md:mx-auto">{body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
