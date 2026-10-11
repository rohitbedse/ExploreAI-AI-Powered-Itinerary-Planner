import { z } from "zod";

// Limits mirror PlanRequest / LoginRequest in apps/api/app/schemas.py.
export const promptSchema = z
  .string()
  .trim()
  .min(3, "Tell us a little more (at least 3 characters).")
  .max(1000, "Please keep it under 1000 characters.");

export const citySchema = z.string().trim().min(2, "Enter a city name.").max(100);

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

export type LoginValues = z.infer<typeof loginSchema>;

/** Flatten a Zod error to `{field: firstMessage}` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
