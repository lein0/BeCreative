export type Utm = { source: string | null; medium: string | null; campaign: string | null };

export type PromoQuery = {
  code: string | null;
  ref: string | null;
  session: string | null;
  utm: Utm;
};

export type DeepLink =
  | ({ type: "class"; slug: string } & PromoQuery)
  | ({ type: "teacher"; slug: string } & PromoQuery)
  | ({ type: "bio"; slug: string } & PromoQuery)
  | ({ type: "pack"; teacherSlug: string; packSlug: string } & PromoQuery)
  | ({ type: "membership"; teacherSlug: string; membershipSlug: string } & PromoQuery)
  | { type: "reset"; token: string | null }
  | { type: "verify"; token: string | null; email: string | null }
  | { type: "login" }
  | { type: "bookings"; flow: string | null; cancelled: boolean };

const BLOCKED = new Set(["teach", "admin", "manage", "crm", "api", "studio"]);

function promo(url: URL): PromoQuery {
  return {
    code: url.searchParams.get("code"),
    ref: url.searchParams.get("ref"),
    session: url.searchParams.get("session"),
    utm: {
      source: url.searchParams.get("utm_source"),
      medium: url.searchParams.get("utm_medium"),
      campaign: url.searchParams.get("utm_campaign"),
    },
  };
}

function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("//") || /[\s<>]/.test(trimmed)) return null;
  try {
    if (trimmed.startsWith("becreative://")) {
      const rest = trimmed.slice("becreative://".length).replace(/^\/+/, "");
      return new URL(`https://app.local/${rest}`);
    }
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function parseDeepLink(raw: string): DeepLink | null {
  const url = toUrl(raw);
  if (!url) return null;
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (!parts.length) return null;
  if (BLOCKED.has(parts[0])) return null;
  const query = promo(url);
  if (parts[0] === "c" && parts[1] && parts.length === 2) return { type: "class", slug: parts[1], ...query };
  if (parts[0] === "t" && parts[1]) {
    if (parts.length === 2) return { type: "teacher", slug: parts[1], ...query };
    if (parts.length === 3 && parts[2] === "bio") return { type: "bio", slug: parts[1], ...query };
    if (parts.length === 4 && parts[2] === "p" && parts[3]) return { type: "pack", teacherSlug: parts[1], packSlug: parts[3], ...query };
    if (parts.length === 4 && parts[2] === "m" && parts[3]) {
      return { type: "membership", teacherSlug: parts[1], membershipSlug: parts[3], ...query };
    }
    return null;
  }
  if (parts[0] === "reset" && parts.length === 1) return { type: "reset", token: url.searchParams.get("token") };
  if (parts[0] === "verify-email" && parts.length === 1) {
    return { type: "verify", token: url.searchParams.get("token"), email: url.searchParams.get("email") };
  }
  if ((parts[0] === "login" || parts[0] === "signup") && parts.length === 1) return { type: "login" };
  if (parts[0] === "bookings" && parts.length === 1) {
    return { type: "bookings", flow: url.searchParams.get("flow"), cancelled: url.searchParams.get("cancelled") === "1" };
  }
  return null;
}

export function hrefForDeepLink(link: DeepLink): string {
  const params = new URLSearchParams();
  if ("code" in link && link.code) params.set("code", link.code);
  if ("ref" in link && link.ref) params.set("ref", link.ref);
  if ("session" in link && link.session) params.set("session", link.session);
  if ("utm" in link && link.utm.source) params.set("utm_source", link.utm.source);
  if ("utm" in link && link.utm.medium) params.set("utm_medium", link.utm.medium);
  if ("utm" in link && link.utm.campaign) params.set("utm_campaign", link.utm.campaign);
  const qs = params.toString();
  const withQuery = (path: string) => (qs ? `${path}?${qs}` : path);
  switch (link.type) {
    case "class":
      return withQuery(`/c/${encodeURIComponent(link.slug)}`);
    case "teacher":
      return withQuery(`/t/${encodeURIComponent(link.slug)}`);
    case "bio":
      return withQuery(`/t/${encodeURIComponent(link.slug)}/bio`);
    case "pack":
      return withQuery(`/t/${encodeURIComponent(link.teacherSlug)}/p/${encodeURIComponent(link.packSlug)}`);
    case "membership":
      return withQuery(`/t/${encodeURIComponent(link.teacherSlug)}/m/${encodeURIComponent(link.membershipSlug)}`);
    case "reset":
      return link.token ? `/reset?token=${encodeURIComponent(link.token)}` : "/reset";
    case "verify": {
      const verify = new URLSearchParams();
      if (link.token) verify.set("token", link.token);
      if (link.email) verify.set("email", link.email);
      const text = verify.toString();
      return text ? `/verify-email?${text}` : "/verify-email";
    }
    case "login":
      return "/login";
    case "bookings":
      return link.cancelled ? "/bookings?cancelled=1" : "/bookings";
    default:
      return "/explore";
  }
}
