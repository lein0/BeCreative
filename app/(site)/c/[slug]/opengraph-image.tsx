import { ImageResponse } from "next/og";
import { classDetail } from "@/lib/queries";
import { priceLabel } from "@/lib/utils";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await classDetail(slug).catch(() => null);
  const title = detail?.class.title ?? "BeCreative";
  const price = detail ? priceLabel(detail.class.pricePerSessionCents, detail.class.pricePerSeriesCents) : "";
  const next = detail?.upcoming.find((session) => session.status === "scheduled");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#24352c", color: "#f6f1e8", padding: 64, fontFamily: "Georgia" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 24, letterSpacing: 4, textTransform: "uppercase", color: "#e7dfd2" }}>{detail?.teacher.studioName ?? "BeCreative"}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, lineHeight: 0.95 }}>{title}</div>
            <div style={{ marginTop: 24, fontSize: 32 }}>{[price, next ? `Next ${next.localDate}` : ""].filter(Boolean).join("  ·  ")}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
