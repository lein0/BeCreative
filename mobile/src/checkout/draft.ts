import type { CheckoutResult } from "../api/types";

export type CheckoutDraft = {
  title: string;
  listPriceCents: number;
  discountCents: number;
  studentPaysCents: number;
  codeApplied: string | null;
  orderId?: string;
  clientSecret?: string;
  publishableKey?: string;
  checkoutUrl?: string;
  waitlisted?: boolean;
  alreadyBooked?: boolean;
};

let draft: CheckoutDraft | null = null;

export function setCheckoutDraft(next: CheckoutDraft) {
  draft = next;
}

export function readCheckoutDraft() {
  return draft;
}

export function draftFromResult(title: string, result: CheckoutResult): CheckoutDraft {
  return {
    title,
    listPriceCents: result.listPriceCents ?? 0,
    discountCents: result.discountCents ?? 0,
    studentPaysCents: result.studentPaysCents ?? 0,
    codeApplied: result.codeApplied ?? null,
    orderId: result.orderId,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    checkoutUrl: result.checkoutUrl,
    waitlisted: result.waitlisted,
    alreadyBooked: result.alreadyBooked,
  };
}
