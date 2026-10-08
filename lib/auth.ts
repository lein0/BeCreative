import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { ensureAdminByEmail, grantAdminRole } from "@/lib/admins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { triggerEnabled } from "@/lib/triggers";
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
      if (!(await authTriggerOn("auth.reset"))) return;
      const rendered = await renderEmail("auth.reset", { name: user.name, href: url, title: "password" });
      await sendEmail({ to: [user.email], subject: rendered.subject, text: `${rendered.text}\n${url}`, html: rendered.html });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!(await authTriggerOn("auth.verify"))) return;
      const rendered = await renderEmail("auth.verify", { name: user.name, href: url, title: "email" });
      await sendEmail({ to: [user.email], subject: rendered.subject, text: `${rendered.text}\n${url}`, html: rendered.html });
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

async function authTriggerOn(id: string) {
  const rows = await db.select().from(schema.triggerOverrides);
  return triggerEnabled(id, Object.fromEntries(rows.map((row) => [row.id, row.enabled])));
}
