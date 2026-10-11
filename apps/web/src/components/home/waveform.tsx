"use client";

import { useRef } from "react";
import { useAudioLevels } from "@/hooks/use-audio-levels";

const BARS = 28;

/** Live microphone waveform (real levels; calm CSS fallback if the mic stream is unavailable). */
export function Waveform({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useAudioLevels(active, ref);
  return (
    <div ref={ref} aria-hidden="true" className="waveform">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="wave-bar" style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}
