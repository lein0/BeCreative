import type { ReactNode } from "react";

/** Stripe loads on the checkout screen only. See pay.native.tsx. */
export function PaymentsProvider({ children }: { children: ReactNode }) {
  return children;
}
