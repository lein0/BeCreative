export const ANALYTICS_COOKIE = "bc_cookie";
export const MARKETING_COOKIE = "bc_attr";
/** Remembers that the GPC explanation was closed. It does not accept analytics or marketing cookies. */
export const GPC_DISMISS_KEY = "bc_gpc_dismissed";

/** True for navigator.globalPrivacyControl and for the Sec-GPC: 1 header. */
export function gpcEnabled(signal: boolean | string | number | null | undefined) {
  return signal === true || signal === 1 || signal === "1";
}

/** GPC wins over an earlier Accept. Analytics and marketing cookies stay off. */
export function privacyChoices(input: { gpc: boolean; accepted: boolean }) {
  if (input.gpc) return { analytics: false, marketing: false, gpc: true as const };
  return { analytics: input.accepted, marketing: input.accepted, gpc: false as const };
}

/** The banner can be closed. Closing it under GPC does not turn cookies on. */
export function cookieNoticeOpen(input: { gpc: boolean; accepted: boolean; gpcDismissed: boolean }) {
  if (input.gpc) return !input.gpcDismissed;
  return !privacyChoices({ gpc: false, accepted: input.accepted }).analytics;
}
