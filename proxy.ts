import { NextResponse, type NextRequest } from "next/server";

const guarded = ["/teach", "/admin", "/manage", "/bookings", "/crm"];

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const token = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (guarded.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  const ref = searchParams.get("ref");
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  if (ref || utmSource || utmMedium || utmCampaign) {
    response.cookies.set(
      "bc_attr",
      JSON.stringify({ ref, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign }),
      { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" },
    );
  }
  const code = searchParams.get("code");
  if (code) response.cookies.set("bc_code", code.toUpperCase(), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/media|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
