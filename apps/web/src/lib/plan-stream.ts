import type { Plan, PlanStop, PlanStreamEvent, StepKey, TravelLeg } from "@/lib/types";

export interface StepState {
  key: StepKey;
  message: string;
  status: "active" | "done";
}

export interface StreamState {
  phase: "idle" | "streaming" | "complete" | "error";
  steps: StepState[];
  stops: PlanStop[];
  legs: TravelLeg[];
  plan: Plan | null;
  error: string | null;
}

export type StreamAction =
  | { type: "start" }
  | { type: "event"; event: PlanStreamEvent }
  | { type: "end" } // transport closed cleanly
  | { type: "fail"; message: string }
  | { type: "reset" };

export const initialStreamState: StreamState = {
  phase: "idle",
  steps: [],
  stops: [],
  legs: [],
  plan: null,
  error: null,
};

const markAllDone = (steps: StepState[]): StepState[] =>
  steps.map((s) => (s.status === "done" ? s : { ...s, status: "done" }));

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "start":
      return { ...initialStreamState, phase: "streaming" };
    case "reset":
      return initialStreamState;
    case "fail":
      return { ...state, phase: "error", error: action.message };
    case "end":
      return state.phase === "streaming"
        ? { ...state, phase: "error", error: "The plan stream ended before it was finished." }
        : state;
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: StreamState, event: PlanStreamEvent): StreamState {
  if (state.phase !== "streaming") return state;
  switch (event.type) {
    case "status": {
      const done = markAllDone(state.steps).filter((s) => s.key !== event.step);
      const prior = state.steps.find((s) => s.key === event.step);
      // Re-announcing a known step updates its message in place; otherwise append a new active step.
      const steps = prior
        ? state.steps.map((s) =>
            s.key === event.step ? { ...s, message: event.message, status: "active" as const } : s,
          )
        : [...done, { key: event.step, message: event.message, status: "active" as const }];
      return { ...state, steps };
    }
    case "stop": {
      if (state.stops.some((s) => s.id === event.stop.id)) return state;
      return {
        ...state,
        stops: [...state.stops, event.stop],
        legs: event.leg_from_previous ? [...state.legs, event.leg_from_previous] : state.legs,
      };
    }
    case "complete":
      return {
        ...state,
        phase: "complete",
        plan: event.plan,
        stops: event.plan.stops,
        legs: event.plan.legs,
        steps: markAllDone(state.steps),
      };
    case "error":
      return { ...state, phase: "error", error: event.message };
  }
}
