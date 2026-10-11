"use client";

import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { PlanStop, TravelLeg } from "@/lib/types";

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_SOURCE = "route";

interface Props {
  stops: PlanStop[];
  legs: TravelLeg[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type RouteData = Parameters<GeoJSONSource["setData"]>[0];

function routeGeoJson(legs: TravelLeg[]): RouteData {
  return {
    type: "FeatureCollection",
    features: legs
      .filter((l) => (l.geometry?.length ?? 0) > 1)
      .map((l) => ({
        type: "Feature" as const,
        properties: { mode: l.mode },
        geometry: { type: "LineString" as const, coordinates: l.geometry ?? [] },
      })),
  };
}

export function PlanMap({ stops, legs, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once (client only; maplibre touches `window`/WebGL at import time).
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;

    void import("maplibre-gl")
      .then(({ default: maplibregl }) => {
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [77.5946, 12.9716],
          zoom: 11,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeGeoJson([]) });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#8b5cf6", "line-width": 5, "line-opacity": 0.9 },
          });
          setReady(true);
        });
        map.on("error", (e) => {
          // Tile/style failures shouldn't take the page down; only a dead map is fatal.
          if (!map.loaded() && !map.getStyle()) setFailed(true);
          console.warn("map error", e.error?.message);
        });
        mapRef.current = map;
        ro = new ResizeObserver(() => map.resize());
        ro.observe(containerRef.current);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      ro?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Sync markers + route whenever the plan (or selection) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = stops.map((stop, i) => {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = String(i + 1);
        el.setAttribute("aria-label", `Stop ${i + 1}: ${stop.name}`);
        el.className = "map-marker";
        el.dataset.active = String(stop.id === selectedId);
        el.addEventListener("click", () => onSelectRef.current(stop.id));
        return new maplibregl.Marker({ element: el })
          .setLngLat([stop.location.lon, stop.location.lat])
          .addTo(map);
      });

      (map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(routeGeoJson(legs));

      if (stops.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        stops.forEach((s) => bounds.extend([s.location.lon, s.location.lat]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 400 });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stops, legs, selectedId, ready]);

  return (
    <div className="relative size-full min-h-64 bg-muted">
      {/* Inline style: maplibre's unlayered CSS sets `.maplibregl-map{position:relative}`, which beats
          Tailwind v4's layered `absolute inset-0` and collapses the container to 0 height. */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        role="region"
        aria-label="Map of your plan"
      />
      {failed && (
        <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          The map couldn&apos;t load (WebGL or network unavailable). Your itinerary is still shown in the list.
        </p>
      )}
    </div>
  );
}
