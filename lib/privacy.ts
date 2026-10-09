export const ANALYTICS_COOKIE = "bc_cookie";
export const MARKETING_COOKIE = "bc_attr";

/** True for navigator.globalPrivacyControl and for the Sec-GPC: 1 header. */
export function gpcEnabled(signal: boolean | string | number | null | undefined) {
  return signal === true || signal === 1 || signal === "1";
}

/** GPC wins over an earlier Accept. Analytics and marketing cookies stay off. */
export function privacyChoices(input: { gpc: boolean; accepted: boolean }) {
  if (input.gpc) return { analytics: false, marketing: false, gpc: true as const };
  return { analytics: input.accepted, marketing: input.accepted, gpc: false as const };
}
