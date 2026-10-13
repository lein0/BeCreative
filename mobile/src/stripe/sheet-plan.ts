export type PaymentSheetPlan =
  | { kind: "mock" }
  | { kind: "sheet"; publishableKey: string }
  | { kind: "unavailable" };

function realKey(value: string | null | undefined) {
  const key = value?.trim() ?? "";
  if (!key.startsWith("pk_") || key.includes("mock")) return null;
  return key;
}

/** A live PaymentIntent is charged only after PaymentSheet, using the API key when the env key is missing. */
export function paymentSheetPlan(input: { clientSecret: string; envKey?: string | null; apiKey?: string | null }): PaymentSheetPlan {
  if (input.clientSecret.startsWith("pi_mock")) return { kind: "mock" };
  const key = realKey(input.apiKey) || realKey(input.envKey);
  if (!key) return { kind: "unavailable" };
  return { kind: "sheet", publishableKey: key };
}
