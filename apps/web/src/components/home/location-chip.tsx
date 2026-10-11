"use client";

import { ChevronDown, History, LocateFixed, Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatedChip } from "@/components/ui/animated-chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { GeoStatus } from "@/hooks/use-geolocation";
import { usePlaceSearch } from "@/hooks/use-place-search";
import type { Place } from "@/lib/geocode";
import type { SavedPlace } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface Props {
  status: GeoStatus;
  placeName: string | null;
  place: SavedPlace | null;
  recents: SavedPlace[];
  onSelect: (place: SavedPlace) => void;
  /** Drop a manual choice (if any) and use the browser's position. */
  onUseCurrent: () => void;
}

const MIN_QUERY = 2;

export function LocationChip({ status, placeName, place, recents, onSelect, onUseCurrent }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const { results, status: searchStatus } = usePlaceSearch(query);
  const searching = query.trim().length >= MIN_QUERY;

  // What the chip shows: the user's pick, else the detected city, else an invitation.
  const label = place?.name ?? (status === "granted" ? (placeName ?? "Near you") : null);
  const locating = !place && status === "locating";

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    setActive(-1);
    if (returnFocus) document.getElementById(triggerId)?.focus();
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Dismiss on outside press.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (p: Place | SavedPlace) => {
    onSelect({ name: p.name, ...("lat" in p && p.lat !== undefined ? { lat: p.lat, lon: p.lon } : {}) });
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && searching && results.length) {
      e.preventDefault();
      choose(results[Math.max(active, 0)]);
    }
  };

  const showList = searching && searchStatus === "done" && results.length > 0;
  const statusText = !searching
    ? ""
    : searchStatus === "loading"
      ? "Searching…"
      : searchStatus === "error"
        ? "Search is unavailable right now."
        : results.length === 0
          ? "No matching places."
          : `${results.length} places found. Use arrow keys to choose.`;

  return (
    <div ref={rootRef} className="relative">
      <AnimatedChip
        id={triggerId}
        className={cn("pr-3", !label && !locating && "chip-invite")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Location: ${label ?? (locating ? "detecting" : "not set")}. Change location`}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {label ? (
          <span className="pulse-dot" aria-hidden />
        ) : locating ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        ) : (
          <MapPin className="size-4 text-brand" aria-hidden />
        )}
        <span>{label ?? (locating ? "Detecting…" : "Use my location")}</span>
        {!label && !locating && <Sparkles className="size-3.5 text-brand" aria-hidden />}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </AnimatedChip>

      {open && (
        <div
          role="dialog"
          aria-label="Choose location"
          onKeyDown={onKeyDown}
          className="glass absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-3rem))] space-y-2 rounded-2xl p-3 shadow-e4"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search for a city"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              placeholder="Search a city, e.g. Pune"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-input bg-card/70 pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
            />
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {statusText}
          </p>

          {searching ? (
            <div>
              {searchStatus === "loading" && (
                <div className="space-y-2 p-1" aria-hidden>
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-4/5" />
                </div>
              )}
              {searchStatus === "error" && (
                <p className="p-2 text-sm text-muted-foreground">Couldn&apos;t search right now. Check your connection.</p>
              )}
              {searchStatus === "done" && results.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No matches. Try another spelling.</p>
              )}
              {showList && (
                <ul id={listId} role="listbox" aria-label="Matching places" className="max-h-64 overflow-auto">
                  {results.map((p, i) => (
                    <li
                      key={p.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      onPointerDown={(e) => e.preventDefault() /* keep input focus until click lands */}
                      onClick={() => choose(p)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm",
                        i === active && "bg-accent",
                      )}
                    >
                      <MapPin className="size-4 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        {p.subtitle && <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  onUseCurrent();
                  close(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-accent"
              >
                <LocateFixed className="size-4 text-brand" aria-hidden />
                Use my current location
              </button>
              {recents.length > 0 && (
                <div role="group" aria-label="Recent places">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
                  {recents.map((r) => (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => choose(r)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <History className="size-4 text-muted-foreground" aria-hidden />
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="px-1 pt-1 text-[0.6875rem] leading-snug text-muted-foreground">
            Search by Photon · ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              OpenStreetMap
            </a>{" "}
            contributors
          </p>
        </div>
      )}
    </div>
  );
}
