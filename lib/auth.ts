import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { ensureAdminByEmail, grantAdminRole } from "@/lib/admins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { appOrigin, authSecret, googleAuthConfigured, isBootstrapAdminEmail, trustedProxyCidrs } from "@/lib/env";

const origin = appOrigin();
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  secret: authSecret(),
  baseURL: origin,
  trustedOrigins: [origin],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      trustedProxies: trustedProxyCidrs(),
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: [user.email],
        subject: "Reset your BeCreative password",
        text: `Reset your password: ${url}`,
        html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: [user.email],
        subject: "Verify your BeCreative email",
        text: `Confirm your email: ${url}`,
        html: `<p>Confirm your email to finish creating your BeCreative account.</p><p><a href="${url}">${url}</a></p>`,
      });
    },
  },
  ...(googleAuthConfigured() && googleClientId && googleClientSecret
    ? { socialProviders: { google: { clientId: googleClientId, clientSecret: googleClientSecret } } }
    : {}),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  user: {
    additionalFields: {
      isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await db
            .insert(schema.userRoles)
            .values({ id: crypto.randomUUID(), userId: created.id, role: "student" })
            .onConflictDoNothing();
          if (created.email && isBootstrapAdminEmail(created.email)) await grantAdminRole(created.id);
        },
      },
    },
    session: {
      create: {
        after: async (created) => {
          const userId = "userId" in created ? String(created.userId) : "";
          if (!userId) return;
          const [row] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
          if (row) await ensureAdminByEmail(row.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
