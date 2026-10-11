import type { components, paths } from "./schema";

export type { components, paths };

/** Shorthand for a named schema, e.g. `Schema<"HealthResponse">`. */
export type Schema<K extends keyof components["schemas"]> = components["schemas"][K];
