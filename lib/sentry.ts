import { logEvent } from "@/lib/log";

export function sentryConfigured() {
  return Boolean(process.env.SENTRY_DSN);
}

export async function captureException(error: unknown, context: Record<string, string> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  logEvent("error", message, { ...context, stack: error instanceof Error ? error.stack : undefined });
  if (!sentryConfigured()) return { skipped: true as const };
  try {
    await fetch(process.env.SENTRY_DSN!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, ...context }),
    });
    return { skipped: false as const };
  } catch {
    return { skipped: false as const, delivered: false as const };
  }
}
