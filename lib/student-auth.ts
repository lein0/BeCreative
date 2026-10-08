import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { session } from "@/lib/db/schema";
import { socialIdTokenReady } from "@/lib/env";
import { APP_EMAIL_VERIFY_PATH, APP_PASSWORD_RESET_PATH, reauthMethod, type ReauthBody } from "@/lib/student-api";

type SocialProvider = "apple" | "google";
type ExchangeResult =
  | { error: string; status: 401 | 503 }
  | { user: { id: string; name: string; email: string }; sessionToken?: string };

export async function exchangeSocialToken(input: { provider: SocialProvider; idToken: string; nonce?: string; firstName?: string; lastName?: string }): Promise<ExchangeResult> {
  if (!socialIdTokenReady(input.provider)) {
    return { error: `${input.provider === "apple" ? "Apple" : "Google"} sign-in is not configured.`, status: 503 as const };
  }
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
    const user = result && "user" in result ? result.user : null;
    if (!user?.id || !user.email) return { error: "Could not sign in.", status: 401 as const };
    const sessionToken = result && "token" in result && typeof result.token === "string" ? result.token : undefined;
    return { user: { id: user.id, name: user.name, email: user.email }, sessionToken };
  } catch {
    return { error: "That sign-in could not be verified.", status: 401 as const };
  }
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

async function dropSession(token: string | undefined) {
  if (!token) return;
  await db.delete(session).where(eq(session.token, token));
}

export async function reauthMatches(actor: { id: string; email: string }, body: ReauthBody) {
  const method = reauthMethod(body);
  if (method === "password" && body.password) {
    try {
      const result = await auth.api.signInEmail({ body: { email: actor.email, password: body.password } });
      const matches = result.user.id === actor.id;
      if (!matches) await dropSession(result.token);
      return matches;
    } catch {
      return false;
    }
  }
  if (method === "social" && body.idToken && (body.provider === "apple" || body.provider === "google")) {
    const exchanged = await exchangeSocialToken({ provider: body.provider, idToken: body.idToken, nonce: body.nonce });
    if (!("user" in exchanged)) return false;
    const matches = exchanged.user.id === actor.id;
    if (!matches) await dropSession(exchanged.sessionToken);
    return matches;
  }
  return false;
}
