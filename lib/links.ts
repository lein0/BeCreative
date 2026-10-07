export type ShareQuery = {
  code?: string | null;
  ref?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  session?: string | null;
};

export function appOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function withQuery(path: string, query: ShareQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return `${appOrigin()}${path}${qs ? `?${qs}` : ""}`;
}

export function teacherPath(slug: string) {
  return `/t/${slug}`;
}

export function classPath(slug: string) {
  return `/c/${slug}`;
}

export function bioPath(slug: string) {
  return `/t/${slug}/bio`;
}

export function packPath(teacherSlug: string, packSlug: string) {
  return `/t/${teacherSlug}/p/${packSlug}`;
}

export function membershipPath(teacherSlug: string, membershipSlug: string) {
  return `/t/${teacherSlug}/m/${membershipSlug}`;
}

export function embedPath(slug: string) {
  return `/embed/${slug}`;
}

export function embedSnippet(slug: string) {
  const src = withQuery(embedPath(slug));
  return `<iframe src="${src}" title="Book with me on BeCreative" style="width:100%;max-width:420px;height:640px;border:0;border-radius:24px"></iframe>`;
}
