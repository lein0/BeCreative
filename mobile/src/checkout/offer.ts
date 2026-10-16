import type { CheckoutResult, StudentApi } from "../api/types";
import { draftFromResult, setCheckoutDraft } from "./draft";

export async function startPackCheckout(api: StudentApi, offer: { id: string; name: string }): Promise<CheckoutResult> {
  const result = await api.purchasePack({ id: offer.id, paymentSheet: true });
  setCheckoutDraft(draftFromResult(offer.name, result));
  return result;
}

export async function startMembershipCheckout(api: StudentApi, offer: { id: string; name: string }): Promise<CheckoutResult> {
  const result = await api.purchaseMembership({ id: offer.id });
  setCheckoutDraft(draftFromResult(offer.name, result));
  return result;
}
