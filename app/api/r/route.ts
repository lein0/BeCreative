import { capture } from "@/lib/analytics";
import { appOrigin } from "@/lib/env";
import { isCatalogEvent } from "@/lib/analytics-events";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function sameOriginPath(raw: string | null) {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    if (url.origin === new URL(appOrigin()).origin) return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
  return "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("e") || "";
  const channel = url.searchParams.get("c") || "email";
  const userId = url.searchParams.get("u");
  if (isCatalogEvent(name) && (name === "notification_opened" || name === "notification_clicked")) {
    await capture({ name, userId, platform: "web", properties: { channel } });
  }
  if (name === "notification_opened") {
    return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
  }
  return Response.redirect(new URL(sameOriginPath(url.searchParams.get("to")), appOrigin()), 302);
}
