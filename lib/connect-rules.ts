export function cardPaymentsReady(input: { stripeOn: boolean; chargesEnabled: boolean }) {
  if (!input.stripeOn) return { ok: true as const, mode: "pay_at_studio" as const };
  if (!input.chargesEnabled) {
    return { ok: false as const, reason: "This studio is still connecting payouts. Card checkout opens once Stripe enables charges." };
  }
  return { ok: true as const, mode: "card" as const };
}

export function statementDescriptor(studio: string, prefix = "BECREATIVE") {
  const clean = studio.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase().slice(0, 10) || "STUDIO";
  return `${prefix}*${clean}`.slice(0, 22);
}
