import { NEIGHBORHOODS } from "@/lib/constants";

export type GeoResult = { lat: number; lng: number; formatted: string; approximate: boolean };

export interface Geocoder {
  readonly name: string;
  geocode(address: string): Promise<GeoResult | null>;
}

function hashOffset(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 33 + char.charCodeAt(0)) % 1000;
  return (hash - 500) / 20_000;
}

export class LocalGeocoder implements Geocoder {
  readonly name = "local";
  async geocode(address: string): Promise<GeoResult | null> {
    const haystack = address.toLowerCase();
    const place = NEIGHBORHOODS.find((item) => haystack.includes(item.name.toLowerCase())) ?? NEIGHBORHOODS[0];
    if (!place) return null;
    return {
      lat: Number((place.lat + hashOffset(address)).toFixed(5)),
      lng: Number((place.lng + hashOffset(address.split("").reverse().join(""))).toFixed(5)),
      formatted: address,
      approximate: true,
    };
  }
}

export class NominatimGeocoder implements Geocoder {
  readonly name = "nominatim";
  async geocode(address: string): Promise<GeoResult | null> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { headers: { "User-Agent": "BeCreative/0.2 (class marketplace demo)" } });
    if (!response.ok) return null;
    const rows = (await response.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = rows[0];
    if (!hit) return null;
    return { lat: Number(hit.lat), lng: Number(hit.lon), formatted: hit.display_name, approximate: false };
  }
}

export class MapboxGeocoder implements Geocoder {
  readonly name = "mapbox";
  async geocode(address: string): Promise<GeoResult | null> {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) throw new Error("MAPBOX_TOKEN is required when GEOCODER_PROVIDER=mapbox.");
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { features?: { center: [number, number]; place_name: string }[] };
    const feature = body.features?.[0];
    if (!feature) return null;
    return { lat: feature.center[1], lng: feature.center[0], formatted: feature.place_name, approximate: false };
  }
}

export async function coordinatesForVisit(
  input: { address: string; neighborhood?: string; city?: string },
  coder: Geocoder = geocoder(),
) {
  const geo = await coder.geocode(`${input.address}, ${input.neighborhood ?? ""} ${input.city || "Los Angeles"}`);
  return { lat: geo?.lat ?? 34.05, lng: geo?.lng ?? -118.25 };
}

export function geocoder(): Geocoder {
  if (process.env.GEOCODER_PROVIDER === "nominatim") return new NominatimGeocoder();
  if (process.env.GEOCODER_PROVIDER === "mapbox") return new MapboxGeocoder();
  return new LocalGeocoder();
}
