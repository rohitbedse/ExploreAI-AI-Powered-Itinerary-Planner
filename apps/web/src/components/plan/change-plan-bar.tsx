"use client";

import { ArrowLeftRight, CirclePlus, Footprints, Send, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedChip as Chip } from "@/components/ui/animated-chip";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import type { ReviseRequest } from "@/lib/types";

interface Props {
  disabled: boolean;
  selectedStopName: string | null;
  selectedStopId: string | null;
  onRevise: (req: ReviseRequest) => void;
}

export function ChangePlanBar({ disabled, selectedStopName, selectedStopId, onRevise }: Props) {
  const [text, setText] = useState("");
  const id = useId();
  const canSwap = selectedStopId !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const instruction = text.trim();
    if (!instruction) return;
    onRevise({ action: "custom", instruction });
    setText("");
  };

  return (
    <GlassCard as="section" aria-label="Change plan" elevation={2} className="space-y-3 rounded-3xl p-4 sm:p-5">
      <h2 className="font-display text-h2">Change plan</h2>
      <div role="group" aria-label="Quick changes" className="flex flex-wrap gap-2">
        <Chip tone="cost" disabled={disabled} onClick={() => onRevise({ action: "cheaper" })}>
          <Wallet className="size-4" aria-hidden /> Cheaper
        </Chip>
        <Chip tone="travel" disabled={disabled} onClick={() => onRevise({ action: "less_walking" })}>
          <Footprints className="size-4" aria-hidden /> Less walking
        </Chip>
        <Chip tone="brand" disabled={disabled} onClick={() => onRevise({ action: "add_activity" })}>
          <CirclePlus className="size-4" aria-hidden /> Add activity
        </Chip>
        <Chip
          tone="time"
          disabled={disabled || !canSwap}
          onClick={() => selectedStopId && onRevise({ action: "swap_stop", stop_id: selectedStopId })}
          title={canSwap ? undefined : "Select a stop in the timeline first"}
        >
          <ArrowLeftRight className="size-4" aria-hidden /> Swap this stop
        </Chip>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selectedStopName ? `Selected: ${selectedStopName}` : "Select a stop to swap it."}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Describe a change
        </label>
        <Input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. add a coffee stop before the park"
          maxLength={500}
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !text.trim()}>
          <Send className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Send</span>
        </Button>
      </form>
    </GlassCard>
  );
}
