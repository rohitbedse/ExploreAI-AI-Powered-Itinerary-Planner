"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/hooks/use-plans";
import { ApiError } from "@/lib/api/client";
import { fieldErrors, loginSchema } from "@/lib/schemas";

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const uid = useId();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    login.mutate(parsed.data, { onSuccess: () => router.push("/saved") });
  };

  const field = (name: "email" | "password", label: string, type: string, autoComplete: string) => {
    const id = `${uid}-${name}`;
    const err = errors[name];
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <Input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-error` : undefined}
        />
        {err && (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {err}
          </p>
        )}
      </div>
    );
  };

  const serverError =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? "Incorrect email or password."
        : login.error.message
      : login.isError
        ? "Couldn't reach the server. Try again."
        : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {field("email", "Email", "email", "email")}
      {field("password", "Password", "password", "current-password")}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <GlowButton type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Logging in…" : "Log in"}
      </GlowButton>
    </form>
  );
}
