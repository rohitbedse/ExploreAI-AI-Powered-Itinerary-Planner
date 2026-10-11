import type { Metadata } from "next";
import { LoginForm } from "@/components/layout/login-form";
import { Reveal } from "@/components/motion/reveal";
import { GlassCard } from "@/components/ui/glass-card";
import { GradientText } from "@/components/ui/gradient-text";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Reveal trigger="mount" className="mx-auto max-w-sm py-8">
      <GlassCard elevation={3} className="space-y-5 rounded-3xl p-6 sm:p-8">
        <div className="space-y-1.5">
          <h1 className="font-display text-h1">
            Welcome <GradientText>back</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">Log in to save plans and sync them across devices.</p>
        </div>
        <LoginForm />
      </GlassCard>
    </Reveal>
  );
}
