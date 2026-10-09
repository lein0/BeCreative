/** Stripe.js is allowed on checkout pages only. The root layout does not load it. */
export const STRIPE_JS_SRC = "https://js.stripe.com/v3/";

export function isStripeCheckoutPath(pathname: string) {
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) return true;
  return /^\/t\/[^/]+\/(?:m|p)\/[^/]+\/?$/.test(pathname);
}

export function stripeJsSrc(pathname: string) {
  return isStripeCheckoutPath(pathname) ? STRIPE_JS_SRC : null;
}
