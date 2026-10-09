export function webPushReady(flag: boolean) {
  return flag && Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Web push stays off until the flag and VAPID keys are both set. */
export async function sendWebPush(input: { endpoint: string; title: string; body: string; enabled: boolean }) {
  if (!webPushReady(input.enabled)) return { ok: false as const, skipped: true as const };
  return { ok: true as const, skipped: false as const, endpoint: input.endpoint, title: input.title, body: input.body };
}
