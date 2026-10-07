import { ImageResponse } from "next/og";
import { teacherProfile } from "@/lib/queries";
import { money } from "@/lib/utils";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await teacherProfile(slug).catch(() => null);
  const prices = profile?.offerings.map((item) => item.pricePerSessionCents).filter((value): value is number => value != null) ?? [];
  const from = prices.length ? `from ${money(Math.min(...prices))}` : "Book a class";
  const next = profile?.upcoming[0];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1c1714", color: "#f6f1e8", padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 22, letterSpacing: 3, color: "#e15a1c" }}>TEACHER</div>
          <div style={{ fontSize: 78, lineHeight: 0.95, marginTop: 12 }}>{profile?.teacher.studioName ?? "BeCreative"}</div>
          <div style={{ fontSize: 32, marginTop: 20 }}>{[from, next ? `Next ${next.localDate}` : ""].filter(Boolean).join("  ·  ")}</div>
        </div>
      </div>
    ),
    size,
  );
}
