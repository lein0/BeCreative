const DEFAULT_ADMIN_EMAIL = "eric.leino@gmail.com";

const PRIVATE_PROXY_CIDRS = ["127.0.0.1/32", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

export function appOrigin() {
  const raw = process.env.APP_URL || process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  return secret || undefined;
}

export function adminEmails() {
  const raw = process.env.ADMIN_EMAILS;
  const source = raw === undefined ? DEFAULT_ADMIN_EMAIL : raw;
  return [...new Set(source.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isBootstrapAdminEmail(email: string) {
  return adminEmails().includes(email.trim().toLowerCase());
}

function splitIds(value: string | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function googleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleIdTokenAudiences() {
  return [...new Set([...splitIds(process.env.GOOGLE_CLIENT_ID), ...splitIds(process.env.GOOGLE_IOS_CLIENT_ID), ...splitIds(process.env.GOOGLE_ANDROID_CLIENT_ID)])];
}

export function appleIdTokenAudiences() {
  return [...new Set([...splitIds(process.env.APPLE_CLIENT_ID), ...splitIds(process.env.APPLE_APP_BUNDLE_IDENTIFIER)])];
}

export function socialIdTokenReady(provider: "apple" | "google") {
  return provider === "google" ? googleIdTokenAudiences().length > 0 : appleIdTokenAudiences().length > 0;
}

export function trustedProxyCidrs() {
  const extras = (process.env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([...PRIVATE_PROXY_CIDRS, ...extras])];
}

export function pgSsl() {
  const mode = process.env.DATABASE_SSL;
  if (mode !== "require" && mode !== "true") return undefined;
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" };
}
