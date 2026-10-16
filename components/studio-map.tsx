"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

export type MapPoint = { id: string; title: string; href: string; lat: number; lng: number; meta: string };

export function StudioMap({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer center={[34.07, -118.33]} zoom={11} className="h-[420px] w-full rounded-3xl" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((point) => (
        <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={9} pathOptions={{ color: "#24352c", fillColor: "#e15a1c", fillOpacity: 0.9 }}>
          <Popup>
            <Link href={point.href} className="font-medium">
              {point.title}
            </Link>
            <div className="text-xs">{point.meta}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
