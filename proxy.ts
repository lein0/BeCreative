import { NextResponse, type NextRequest } from "next/server";
import { promoCookieFromLink } from "@/lib/pricing";

const guarded = ["/teach", "/admin", "/manage", "/bookings", "/crm", "/notifications", "/settings"];

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (request.method === "POST") {
    const pathToken = pathname.match(/^\/unsubscribe\/([^/]+)$/)?.[1];
    const queryToken = pathname === "/unsubscribe" ? searchParams.get("token") : null;
    const token = pathToken || queryToken;
    if (token) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/unsubscribe/${token}`;
      url.search = "";
      return NextResponse.rewrite(url);
    }
  }
  const token = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (guarded.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; font-src 'self' data:; frame-ancestors 'self'",
  );
  const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  const ref = searchParams.get("ref");
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  if (ref || utmSource || utmMedium || utmCampaign) {
    response.cookies.set(
      "bc_attr",
      JSON.stringify({ ref, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign }),
      { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure },
    );
  }
  const code = promoCookieFromLink(searchParams.get("code"));
  if (code) response.cookies.set("bc_code", code, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/media|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
