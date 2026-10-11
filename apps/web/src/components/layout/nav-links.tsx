"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  /** Is this item "current" for the given pathname? */
  match: (pathname: string) => boolean;
  /** Hide on very narrow screens to keep the bar on one line. */
  hideOnMobile?: boolean;
}

const linkClass =
  "relative rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground";

/** Nav links with a single underline that slides to whichever link is current. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const activeHref = items.find((i) => i.match(pathname))?.href ?? null;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>('[aria-current="page"]');
      // offsetWidth is 0 when the link is display:none (hidden on mobile): no underline then.
      setBar(el && el.offsetWidth > 0 ? { x: el.offsetLeft + 14, w: el.offsetWidth - 28 } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [activeHref, items.length]);

  return (
    <div ref={wrapRef} className="relative flex items-center">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === activeHref ? "page" : undefined}
          className={cn(linkClass, item.hideOnMobile && "hidden sm:inline-flex")}
        >
          {item.label}
        </Link>
      ))}
      <span
        aria-hidden
        className="nav-indicator"
        style={{ width: bar?.w ?? 0, transform: `translateX(${bar?.x ?? 0}px)`, opacity: bar ? 1 : 0 }}
      />
    </div>
  );
}
