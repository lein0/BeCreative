"use server";

import { captureException } from "@/lib/sentry";

export async function reportErrorAction(message: string, digest?: string) {
  const error = new Error(message.slice(0, 500) || "Request failed");
  await captureException(error, digest ? { digest } : {});
}
