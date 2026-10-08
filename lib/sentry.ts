import { logEvent } from "@/lib/log";

export function sentryConfigured() {
  return Boolean(process.env.SENTRY_DSN);
}

export async function captureException(error: unknown, context: Record<string, string> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  logEvent("error", message, { ...context, stack: error instanceof Error ? error.stack : undefined });
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return { skipped: true as const };
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\//, "");
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({ event_id: eventId, message, level: "error", platform: "node", extra: context, timestamp: Date.now() / 1000 }),
    ].join("\n");
    await fetch(`${url.protocol}//${url.host}/api/${project}/envelope/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=becreative/0.2`,
      },
      body: envelope,
    });
    return { skipped: false as const };
  } catch {
    return { skipped: false as const, delivered: false as const };
  }
}
