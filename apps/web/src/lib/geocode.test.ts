import { describe, expect, it } from "vitest";
import { photonToPlaces } from "./geocode";

const feature = (name: string | undefined, extra: object = {}, coords: [number, number] = [73.85, 18.52]) => ({
  geometry: { coordinates: coords },
  properties: { name, osm_id: 1, osm_type: "R", state: "Maharashtra", country: "India", ...extra },
});

describe("photonToPlaces", () => {
  it("maps a feature to a place with [lon, lat] ordering", () => {
    const [p] = photonToPlaces({ features: [feature("Pune")] });
    expect(p).toEqual({ id: "R1", name: "Pune", subtitle: "Maharashtra, India", lat: 18.52, lon: 73.85 });
  });

  it("drops nameless and duplicate features", () => {
    const places = photonToPlaces({ features: [feature("Pune"), feature(undefined), feature("Pune"), feature("Mumbai")] });
    expect(places.map((p) => p.name)).toEqual(["Pune", "Mumbai"]);
  });

  it("omits a state that repeats the name", () => {
    const [p] = photonToPlaces({ features: [feature("Goa", { state: "Goa" })] });
    expect(p.subtitle).toBe("India");
  });

  it("returns [] for malformed payloads instead of throwing", () => {
    expect(photonToPlaces(null)).toEqual([]);
    expect(photonToPlaces({ features: [{ geometry: {} }] })).toEqual([]);
    expect(photonToPlaces({ nope: true })).toEqual([]);
  });
});
