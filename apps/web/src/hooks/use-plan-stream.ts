"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { API_URL, ApiError } from "@/lib/api/client";
import { initialStreamState, streamReducer } from "@/lib/plan-stream";
import { streamPlanEvents } from "@/lib/sse";
import type { Plan } from "@/lib/types";

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name === "StreamProtocolError") return err.message;
  // In dev, name the URL: NEXT_PUBLIC_API_URL is baked in when `next dev` starts, so a stale
  // value in the launching shell silently points the app at the wrong port.
  if (process.env.NODE_ENV === "development") {
    return `We couldn't reach the planner at ${API_URL}. Is the API running there?`;
  }
  return "We couldn't reach the planner. Check your connection and try again.";
}

/** Runs one SSE plan/revision stream at a time; starting a new one cancels the previous. */
export function usePlanStream() {
  const [state, dispatch] = useReducer(streamReducer, initialStreamState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(
    async (path: string, body: unknown, onComplete?: (plan: Plan) => void) => {
      cancel();
      const ac = new AbortController();
      abortRef.current = ac;
      dispatch({ type: "start" });
      try {
        await streamPlanEvents(path, body, {
          signal: ac.signal,
          onEvent: (event) => {
            dispatch({ type: "event", event });
            if (event.type === "complete") onComplete?.(event.plan);
          },
        });
        if (!ac.signal.aborted) dispatch({ type: "end" });
      } catch (err) {
        if (!ac.signal.aborted) dispatch({ type: "fail", message: messageOf(err) });
      }
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return { state, start, cancel };
}
