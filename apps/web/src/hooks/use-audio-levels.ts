"use client";

import { useEffect, type RefObject } from "react";

/**
 * Drives a waveform from the real microphone level while `active`. Bars are the children of
 * `containerRef`; their `transform: scaleY()` is written straight to the DOM from a
 * requestAnimationFrame loop, so audio at 60fps never goes through React state.
 *
 * Web Speech API exposes no audio levels, so this opens a second (read-only) getUserMedia
 * stream. If that is refused or unavailable the container gets `data-fallback="true"` and CSS
 * shows a calm decorative animation instead (it does not pretend to be live).
 */
export function useAudioLevels(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    container.removeAttribute("data-fallback");

    const bars = Array.from(container.children) as HTMLElement[];

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const usable = Math.floor(data.length * 0.8); // top bins are mostly empty for speech

        const tick = () => {
          analyser.getByteFrequencyData(data);
          for (let i = 0; i < bars.length; i++) {
            const v = data[Math.floor((i / bars.length) * usable)] / 255;
            bars[i].style.transform = `scaleY(${(0.14 + v * 0.86).toFixed(3)})`;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) container.setAttribute("data-fallback", "true");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      bars.forEach((b) => (b.style.transform = ""));
    };
  }, [active, containerRef]);
}
