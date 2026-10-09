import type { CheckoutResult } from "../api/types";

export function checkoutKind(result: CheckoutResult): "sheet" | "browser" | "done" {
  if (result.clientSecret) return "sheet";
  if (result.checkoutUrl) return "browser";
  return "done";
}
