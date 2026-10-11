"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { NavLinks, type NavItem } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useLogout, useMe } from "@/hooks/use-plans";
import { useScrolled } from "@/hooks/use-scrolled";

const PLAN: NavItem = {
  href: "/",
  label: "Plan",
  match: (p) => p === "/" || p.startsWith("/plan"),
  hideOnMobile: true,
};
const SAVED: NavItem = { href: "/saved", label: "Saved plans", match: (p) => p.startsWith("/saved") };
const LOGIN: NavItem = { href: "/login", label: "Log in", match: (p) => p.startsWith("/login") };

export function SiteHeader() {
  const { data: user } = useMe();
  const logout = useLogout();
  const scrolled = useScrolled(8);

  const items = user ? [PLAN, SAVED] : [PLAN, SAVED, LOGIN];

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div
        data-scrolled={scrolled}
        className="header-bar glass mx-auto flex items-center justify-between gap-2 rounded-full pl-4 pr-2"
      >
        <Link href="/" className="flex items-center gap-2.5 rounded-full font-display text-lg font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-xl text-white shadow-e2"
            style={{ background: "var(--gradient-deep)" }}
          >
            <Compass className="size-4.5" />
          </span>
          ExploreAI
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5">
          <NavLinks items={items} />
          {user && (
            <button
              type="button"
              className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => logout.mutate()}
            >
              Log out
            </button>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
