import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { analyticsEvents } from "@/lib/db/schema";
import { isCatalogEvent, platformName, type AnalyticsEventName, type PlatformName } from "@/lib/analytics-events";
import { gpcEnabled, privacyChoices } from "@/lib/privacy";

export type TrackInput = {
  name: AnalyticsEventName | string;
  userId?: string | null;
  anonymousId?: string | null;
  platform?: string | null;
  path?: string | null;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  shareCode?: string | null;
  vertical?: string | null;
  category?: string | null;
  city?: string | null;
  device?: string | null;
  properties?: Record<string, string>;
  consent?: boolean;
  /** Test hook. When omitted, the Sec-GPC request header is used. */
  gpc?: boolean;
  demo?: boolean;
  at?: Date;
};

async function cookieValue(name: string) {
  try {
    const jar = await cookies();
    return jar.get(name)?.value ?? null;
  } catch {
    return null;
  }
}

export function posthogConfigured() {
  return Boolean(process.env.POSTHOG_KEY);
}

/** Session recording stays off on every capture. */
export const posthogOptions = { disable_session_recording: true as const };

export async function forwardPostHog(input: { name: string; distinctId: string; properties: Record<string, string | boolean>; consent: boolean }) {
  const key = process.env.POSTHOG_KEY;
  if (!key || !input.consent) return { skipped: true as const };
  const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: input.name,
      distinct_id: input.distinctId,
      properties: { ...input.properties, $lib: "becreative", ...posthogOptions },
    }),
  });
  return { skipped: false as const, ok: response.ok };
}

async function gpcFromRequest() {
  try {
    return gpcEnabled((await headers()).get("sec-gpc"));
  } catch {
    return false;
  }
}

export async function capture(input: TrackInput) {
  if (!isCatalogEvent(input.name)) return { ok: false as const };
  const gpc = input.gpc ?? (await gpcFromRequest());
  const accepted = input.consent ?? (await cookieValue("bc_cookie")) === "1";
  const choices = privacyChoices({ gpc, accepted });
  const anonymousId = input.anonymousId ?? (gpc ? null : await cookieValue("bc_anon"));
  const consent = choices.analytics;
  const id = crypto.randomUUID();
  const platform: PlatformName = platformName(input.platform);
  await db.insert(analyticsEvents).values({
    id,
    name: input.name,
    anonymousId,
    userId: input.userId ?? null,
    platform,
    path: input.path ?? null,
    source: input.source ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    shareCode: input.shareCode ?? null,
    vertical: input.vertical ?? null,
    category: input.category ?? null,
    city: input.city ?? null,
    device: input.device ?? null,
    properties: input.properties ?? {},
    isDemo: Boolean(input.demo),
    ...(input.at ? { createdAt: input.at } : {}),
  });
  const distinctId = input.userId || anonymousId || id;
  try {
    await forwardPostHog({ name: input.name, distinctId, properties: { platform, ...(input.properties ?? {}) }, consent });
  } catch {
    // The first-party row is already stored. A PostHog outage must not fail the page.
  }
  return { ok: true as const, id };
}

export async function stitchAnonymous(userId: string, anonymousId: string | null) {
  if (!anonymousId) return;
  await db.update(analyticsEvents).set({ userId }).where(and(eq(analyticsEvents.anonymousId, anonymousId), isNull(analyticsEvents.userId)));
}

export async function stitchFromCookies(userId: string) {
  await stitchAnonymous(userId, await cookieValue("bc_anon"));
}
