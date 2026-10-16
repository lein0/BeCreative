export { authSessionRedirect } from "../../../lib/mobile-client";

export type CheckoutSessionOutcome = "success" | "cancel" | "dismiss";

/** Stripe success and cancel both redirect to becreative://bookings. The query says which one happened. */
export function checkoutSessionOutcome(result: { type: string; url?: string }): CheckoutSessionOutcome {
  if (result.type === "cancel") return "cancel";
  if (result.type !== "success" || !result.url) return "dismiss";
  let params: URLSearchParams;
  try {
    params = new URL(result.url).searchParams;
  } catch {
    return "dismiss";
  }
  if (params.get("cancelled") === "1") return "cancel";
  if (params.get("paid") === "1" || params.get("pack") === "1" || params.get("membership") === "1") return "success";
  return "dismiss";
}

/** Pack and membership browser checkout only leave the offer after a paid return. */
export function checkoutReturnAction(outcome: CheckoutSessionOutcome) {
  if (outcome === "success") return { proceed: true, message: null as string | null };
  if (outcome === "cancel") return { proceed: false, message: "Checkout was cancelled. You can try again." };
  return { proceed: false, message: "Checkout closed before it finished. You can try again." };
}
