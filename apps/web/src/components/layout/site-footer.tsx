import { Compass } from "lucide-react";
import Link from "next/link";

const link = "rounded-md underline-offset-4 transition-colors hover:text-foreground hover:underline";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-20 flex max-w-6xl flex-col gap-3 border-t px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2">
        <Compass className="size-4" aria-hidden />
        <span>© {new Date().getFullYear()} ExploreAI</span>
      </p>
      <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link href="/saved" className={link}>
          Saved plans
        </Link>
        <Link href="/login" className={link}>
          Log in
        </Link>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className={link}>
          © OpenStreetMap contributors
        </a>
      </nav>
    </footer>
  );
}
