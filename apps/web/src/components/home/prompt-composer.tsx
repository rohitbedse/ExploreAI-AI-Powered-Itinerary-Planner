"use client";

import { Mic, MicOff, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { ExampleCards } from "@/components/home/example-cards";
import { FloatingCards } from "@/components/home/floating-cards";
import { LocationChip } from "@/components/home/location-chip";
import { ParsePreview } from "@/components/home/parse-preview";
import { TypewriterPlaceholder } from "@/components/home/typewriter-placeholder";
import { Waveform } from "@/components/home/waveform";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowButton } from "@/components/ui/glow-button";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { EXAMPLE_PROMPTS } from "@/lib/examples";
import { parsePrompt, toTags } from "@/lib/parse-prompt";
import { promptSchema } from "@/lib/schemas";
import { pendingRequest } from "@/lib/storage";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1000;

/** Short, state-aware guidance under the box. */
function helperFor(length: number, detected: number): string {
  const left = MAX_CHARS - length;
  if (left <= 100) return `${left} character${left === 1 ? "" : "s"} left.`;
  if (length === 0) return "Mention budget, time, who's coming and the vibe.";
  if (length < 3) return "Keep going…";
  if (detected < 2) return "Add a budget or how long you have for a sharper plan.";
  return "Looks good. Ready when you are.";
}

export function PromptComposer() {
  const router = useRouter();
  const geo = useGeolocation();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mod, setMod] = useState("Ctrl");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const stopTyping = useCallback(() => {
    if (typingRef.current) clearInterval(typingRef.current);
    typingRef.current = null;
  }, []);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod("⌘");
    const onShow = () => setSubmitting(false); // coming back via bfcache
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pageshow", onShow);
      stopTyping();
    };
  }, [stopTyping]);

  const appendSpoken = useCallback(
    (text: string) => {
      stopTyping();
      setPrompt((cur) => (cur.trim() ? `${cur.trimEnd()} ${text}` : text));
    },
    [stopTyping],
  );
  const voice = useSpeechRecognition(appendSpoken);

  // Example cards "type" their prompt into the box; typing by hand cancels it.
  const typeInto = useCallback(
    (text: string) => {
      stopTyping();
      setError(null);
      textareaRef.current?.focus();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPrompt(text);
        return;
      }
      let i = 0;
      setPrompt("");
      typingRef.current = setInterval(() => {
        i = Math.min(text.length, i + 2);
        setPrompt(text.slice(0, i));
        if (i >= text.length) stopTyping();
      }, 16);
    },
    [stopTyping],
  );

  // Parsing runs on a deferred copy so typing stays instant even on slow devices.
  const deferred = useDeferredValue(prompt);
  const tags = useMemo(() => toTags(parsePrompt(deferred)), [deferred]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    const parsed = promptSchema.safeParse(prompt);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    pendingRequest.set({ prompt: parsed.data, ...geo.toRequestLocation() });
    router.push("/plan/new");
  };

  const empty = prompt.trim() === "";
  const nearLimit = MAX_CHARS - prompt.length <= 100;

  return (
    <div>
      <div className="relative mx-auto max-w-3xl">
        <FloatingCards />
        <div className="prompt-glow relative z-10 rounded-3xl">
          <GlassCard elevation={4} className="rounded-3xl p-5 sm:p-6">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold tracking-tight">
                  What are you in the mood for?
                </label>
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    id={fieldId}
                    value={prompt}
                    onChange={(e) => {
                      stopTyping();
                      setPrompt(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                    }}
                    rows={4}
                    maxLength={MAX_CHARS}
                    className="min-h-32 rounded-none border-0 bg-transparent px-1 py-1 pr-14 text-base leading-relaxed shadow-none backdrop-blur-none focus-visible:border-transparent focus-visible:ring-0"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${hintId} ${errorId}` : hintId}
                  />
                  <TypewriterPlaceholder phrases={EXAMPLE_PROMPTS} active={prompt === "" && !voice.listening} />
                  {voice.supported && (
                    <span className="absolute right-0 top-0">
                      <span className={cn("inline-flex rounded-full", voice.listening && "mic-ripple")}>
                        <Button
                          type="button"
                          variant={voice.listening ? "default" : "outline"}
                          size="icon"
                          onClick={voice.listening ? voice.stop : voice.start}
                          aria-pressed={voice.listening}
                          aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
                        >
                          {voice.listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
                        </Button>
                      </span>
                    </span>
                  )}
                </div>
                {voice.listening && (
                  <div role="status" className="mt-2 flex items-center gap-3 text-sm text-brand">
                    <Waveform active />
                    <span className="min-w-0 truncate">Listening… {voice.interim}</span>
                  </div>
                )}
                {voice.error && (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    {voice.error}
                  </p>
                )}
                {error && (
                  <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <ParsePreview tags={tags} />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <LocationChip
                  status={geo.status}
                  placeName={geo.placeName}
                  place={geo.place}
                  recents={geo.recents}
                  onSelect={geo.selectPlace}
                  onUseCurrent={() => (geo.place ? geo.clearPlace() : geo.locate())}
                />
                <span
                  aria-hidden="true"
                  className={cn("text-xs tabular-nums text-muted-foreground", nearLimit && "font-semibold text-travel")}
                >
                  {prompt.length}/{MAX_CHARS}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Tooltip content="Describe your plan first" enabled={empty}>
                  {(describedBy) => (
                    <GlowButton
                      type="submit"
                      variant="gradient"
                      className="w-full text-base sm:w-auto"
                      icon={<Sparkles className="sparkle size-4" aria-hidden />}
                      loading={submitting}
                      loadingLabel="Planning…"
                      softDisabled={empty}
                      aria-describedby={describedBy}
                    >
                      Plan my day
                    </GlowButton>
                  )}
                </Tooltip>
                <p id={hintId} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{helperFor(prompt.length, tags.length)}</span>
                  <span className="sr-only">Press Control or Command plus Enter to plan.</span>
                  <span aria-hidden="true" className="inline-flex items-center gap-1">
                    <Kbd>{mod}</Kbd>
                    <Kbd>↵</Kbd>
                  </span>
                </p>
              </div>
            </form>
          </GlassCard>
        </div>
      </div>

      <div className="mt-10">
        <ExampleCards onPick={typeInto} />
      </div>
    </div>
  );
}
