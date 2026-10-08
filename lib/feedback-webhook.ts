import { createHmac, timingSafeEqual } from "node:crypto";

export type DeliveryAttempt = {
  attempt: number;
  status: "delivered" | "failed" | "undelivered";
  httpStatus: number | null;
  error: string | null;
};

export type WebhookDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  secret: string;
  key?: string;
  delays?: number[];
};

export const WEBHOOK_RETRY_DELAYS_MS = [500, 1500];

export function signFeedbackBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function feedbackSignatureHeader(secret: string, body: string) {
  return `sha256=${signFeedbackBody(secret, body)}`;
}

export function bearerMatches(header: string | null, token: string | undefined) {
  if (!token) return false;
  if (!header || !header.toLowerCase().startsWith("bearer ")) return false;
  const presented = header.slice(header.indexOf(" ") + 1).trim();
  const left = Buffer.from(presented);
  const right = Buffer.from(token);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * POSTs the raw JSON body. The signature covers that exact string.
 * Attempt 1 is immediate. Later attempts wait `delays[n-1]` milliseconds.
 * A missing secret fails once and does not hit the network.
 */
export async function deliverWebhook(url: string, body: string, deps: WebhookDeps): Promise<DeliveryAttempt[]> {
  if (!deps.secret) {
    return [{ attempt: 1, status: "failed", httpStatus: null, error: "FEEDBACK_WEBHOOK_SECRET is not set" }];
  }
  const delays = deps.delays ?? WEBHOOK_RETRY_DELAYS_MS;
  const attempts: DeliveryAttempt[] = [];
  const total = delays.length + 1;
  for (let index = 0; index < total; index += 1) {
    if (index > 0) await deps.sleep(delays[index - 1] ?? delays[delays.length - 1] ?? 0);
    const attempt = index + 1;
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-feedback-signature": feedbackSignatureHeader(deps.secret, body),
      };
      if (deps.key) headers.authorization = `Bearer ${deps.key}`;
      const response = await deps.fetch(url, { method: "POST", headers, body });
      if (response.ok) {
        attempts.push({ attempt, status: "delivered", httpStatus: response.status, error: null });
        return attempts;
      }
      attempts.push({ attempt, status: "failed", httpStatus: response.status, error: `HTTP ${response.status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook request failed";
      attempts.push({ attempt, status: "failed", httpStatus: null, error: message });
    }
  }
  return attempts;
}

export interface FeedbackDispatcher {
  readonly name: string;
  deliver(body: string): Promise<DeliveryAttempt[]>;
}

export function createFeedbackDispatcher(env: NodeJS.ProcessEnv = process.env): FeedbackDispatcher {
  const url = env.FEEDBACK_WEBHOOK_URL?.trim() ?? "";
  if (!url) {
    return {
      name: "undelivered",
      async deliver() {
        return [{ attempt: 1, status: "undelivered", httpStatus: null, error: "FEEDBACK_WEBHOOK_URL is not set" }];
      },
    };
  }
  return {
    name: "webhook",
    deliver(body: string) {
      return deliverWebhook(url, body, {
        fetch: globalThis.fetch,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        secret: env.FEEDBACK_WEBHOOK_SECRET ?? "",
        key: env.FEEDBACK_WEBHOOK_KEY || undefined,
      });
    },
  };
}
