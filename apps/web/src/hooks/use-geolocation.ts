"use client";

import { useCallback, useEffect, useState } from "react";
import { reversePlace } from "@/lib/geocode";
import { placeOverride, recentPlaces, type SavedPlace } from "@/lib/storage";
import type { PlanRequest } from "@/lib/types";

export type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable";

interface Coords {
  lat: number;
  lon: number;
}

/**
 * Auto-detects the browser position once on mount and resolves it to a city name (Photon reverse
 * geocode, best effort). A place the user picks by hand always wins and is remembered.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [place, setPlace] = useState<SavedPlace | null>(null);
  const [recents, setRecents] = useState<SavedPlace[]>([]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus("granted");
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    setRecents(recentPlaces.get());
    const saved = placeOverride.get();
    if (saved) {
      setPlace(saved);
      return;
    }
    locate();
  }, [locate]);

  // Name the detected coordinates ("Pune"); failure just leaves the chip on a generic label.
  useEffect(() => {
    if (!coords) return;
    const ac = new AbortController();
    reversePlace(coords.lat, coords.lon, ac.signal)
      .then((p) => setPlaceName(p?.name ?? null))
      .catch(() => setPlaceName(null));
    return () => ac.abort();
  }, [coords]);

  const selectPlace = useCallback((p: SavedPlace) => {
    placeOverride.set(p);
    setPlace(p);
    setRecents(recentPlaces.push(p));
  }, []);

  const clearPlace = useCallback(() => {
    placeOverride.clear();
    setPlace(null);
    locate();
  }, [locate]);

  const toRequestLocation = useCallback((): Pick<PlanRequest, "location" | "city"> => {
    if (place) {
      return {
        city: place.name,
        ...(place.lat !== undefined && place.lon !== undefined ? { location: { lat: place.lat, lon: place.lon } } : {}),
      };
    }
    if (coords) return { location: coords, ...(placeName ? { city: placeName } : {}) };
    return {};
  }, [place, coords, placeName]);

  return { status, coords, placeName, place, recents, locate, selectPlace, clearPlace, toRequestLocation };
}
