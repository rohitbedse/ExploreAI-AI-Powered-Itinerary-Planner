import type { Schema } from "@exploreai/shared";

export type Plan = Schema<"Plan">;
export type PlanStop = Schema<"PlanStop">;
export type TravelLeg = Schema<"TravelLeg">;
export type PlanRequest = Schema<"PlanRequest">;
export type ReviseRequest = Schema<"ReviseRequest">;
export type ReviseAction = ReviseRequest["action"];
export type PlanStreamEvent = Schema<"PlanStreamEvent">;
export type SavedPlanItem = Schema<"SavedPlanItem">;
export type LoginRequest = Schema<"LoginRequest">;
export type User = Schema<"User">;
export type StepKey = Schema<"StatusEvent">["step"];
