import { verifyProviderIdToken } from "better-auth/oauth2";
import { and, eq, sql } from "drizzle-orm";
import { releaseSocialLogin } from "@/lib/account-data";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";
import { socialIdTokenReady } from "@/lib/env";
import { APP_EMAIL_VERIFY_PATH, APP_PASSWORD_RESET_PATH, reauthMethod, socialLinkAllowed, type ReauthBody } from "@/lib/student-api";

type SocialProvider = "apple" | "google";
type ExchangeResult =
  | { error: string; status: 401 | 503 }
  | { user: { id: string; name: string; email: string }; sessionToken?: string };

async function readSocialProfile(input: { provider: SocialProvider; idToken: string; nonce?: string }) {
  try {
    const ctx = await auth.$context;
    const provider = ctx.socialProviders.find((item) => item.id === input.provider);
    if (!provider) return null;
    const valid = await verifyProviderIdToken(provider, input.idToken, input.nonce);
    if (!valid) return null;
    const info = await provider.getUserInfo({ idToken: input.idToken });
    if (!info?.data) return null;
    const subject = String(await provider.accountSubject({ tokens: { idToken: input.idToken }, profile: info.data })).trim();
    const profileUser = info.user as { email?: string; emailVerified?: boolean } | undefined;
    return {
      subject: !subject || subject === "undefined" || subject === "null" ? "" : subject,
      email: profileUser?.email?.trim().toLowerCase() ?? "",
      emailVerified: Boolean(profileUser?.emailVerified),
    };
  } catch {
    return null;
  }
}

async function refuseUnsafeSocialLink(input: { provider: SocialProvider; idToken: string; nonce?: string }): Promise<ExchangeResult | null> {
  const profile = await readSocialProfile(input);
  if (!profile?.email) return null;
  const [local] = await db.select({ id: user.id, email: user.email, emailVerified: user.emailVerified, deletedAt: user.deletedAt }).from(user).where(sql`lower(${user.email}) = ${profile.email}`).limit(1);
  if (!local || local.deletedAt) return null;
  const [linked] = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, local.id), eq(account.providerId, input.provider))).limit(1);
  if (linked) return null;
  if (socialLinkAllowed({
    providerEmailVerified: profile.emailVerified,
    localEmailVerified: local.emailVerified,
    sameEmail: local.email.trim().toLowerCase() === profile.email,
  })) return null;
  return { error: "That sign-in could not be verified.", status: 401 as const };
}

async function deletedUserIdFromToken(input: { provider: SocialProvider; idToken: string; nonce?: string }) {
  const profile = await readSocialProfile(input);
  if (!profile?.subject) return null;
  const [linked] = await db.select({ userId: account.userId }).from(account).where(and(eq(account.providerId, input.provider), eq(account.accountId, profile.subject))).limit(1);
  if (!linked || !(await isDeletedUser(linked.userId))) return null;
  return linked.userId;
}

async function requestSocialSignIn(input: { provider: SocialProvider; idToken: string; nonce?: string; firstName?: string; lastName?: string }): Promise<ExchangeResult> {
  if (!socialIdTokenReady(input.provider)) {
    return { error: `${input.provider === "apple" ? "Apple" : "Google"} sign-in is not configured.`, status: 503 as const };
  }
  const blocked = await refuseUnsafeSocialLink(input);
  if (blocked) return blocked;
  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: input.provider,
        disableRedirect: true,
        idToken: {
          token: input.idToken,
          nonce: input.nonce,
          user: input.firstName || input.lastName ? { name: { firstName: input.firstName, lastName: input.lastName } } : undefined,
        },
      },
    });
    const signedIn = result && "user" in result ? result.user : null;
    if (!signedIn?.id || !signedIn.email) return { error: "Could not sign in.", status: 401 as const };
    const sessionToken = result && "token" in result && typeof result.token === "string" ? result.token : undefined;
    return { user: { id: signedIn.id, name: signedIn.name, email: signedIn.email }, sessionToken };
  } catch {
    return { error: "That sign-in could not be verified.", status: 401 as const };
  }
}

async function isDeletedUser(userId: string) {
  const [person] = await db.select({ deletedAt: user.deletedAt }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(person?.deletedAt);
}

export async function exchangeSocialToken(input: { provider: SocialProvider; idToken: string; nonce?: string; firstName?: string; lastName?: string }): Promise<ExchangeResult> {
  const released = new Set<string>();
  async function freeDeleted(userId: string | null) {
    if (!userId || released.has(userId) || !(await isDeletedUser(userId))) return false;
    await releaseSocialLogin(userId);
    released.add(userId);
    return true;
  }
  const first = await requestSocialSignIn(input);
  if ("user" in first) {
    if (await freeDeleted(first.user.id)) return requestSocialSignIn(input);
    return first;
  }
  if (await freeDeleted(await deletedUserIdFromToken(input))) return requestSocialSignIn(input);
  return first;
}

export async function requestAppPasswordReset(email: string) {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: APP_PASSWORD_RESET_PATH } });
}

export async function confirmAppPasswordReset(token: string, password: string) {
  const result = await auth.api.resetPassword({ body: { token, newPassword: password } });
  if (result.status === false) throw new Error("invalid");
}

export async function requestAppEmailVerification(email: string) {
  await auth.api.sendVerificationEmail({ body: { email, callbackURL: APP_EMAIL_VERIFY_PATH } });
}

export async function confirmAppEmailVerification(token: string) {
  const result = await auth.api.verifyEmail({ query: { token } });
  if (result && result.status === false) throw new Error("invalid");
}

async function passwordMatches(actorId: string, password: string) {
  const [credential] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, actorId), eq(account.providerId, "credential"), eq(account.accountId, actorId)))
    .limit(1);
  if (!credential?.password) return false;
  const ctx = await auth.$context;
  return ctx.password.verify({ hash: credential.password, password });
}

async function socialIdentityMatches(actorId: string, providerName: SocialProvider, idToken: string, nonce?: string) {
  const ctx = await auth.$context;
  const provider = ctx.socialProviders.find((item) => item.id === providerName);
  if (!provider) return false;
  const valid = await verifyProviderIdToken(provider, idToken, nonce);
  if (!valid) return false;
  const info = await provider.getUserInfo({ idToken });
  if (!info?.data) return false;
  const subject = String(await provider.accountSubject({ tokens: { idToken }, profile: info.data })).trim();
  if (!subject || subject === "undefined" || subject === "null") return false;
  const [linked] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, actorId), eq(account.providerId, providerName), eq(account.accountId, subject)))
    .limit(1);
  return Boolean(linked);
}

export async function reauthMatches(actor: { id: string; email: string }, body: ReauthBody) {
  const method = reauthMethod(body);
  if (method === "password" && body.password) {
    try {
      return await passwordMatches(actor.id, body.password);
    } catch {
      return false;
    }
  }
  if (method === "social" && body.idToken && (body.provider === "apple" || body.provider === "google")) {
    try {
      return await socialIdentityMatches(actor.id, body.provider, body.idToken, body.nonce);
    } catch {
      return false;
    }
  }
  return false;
}
