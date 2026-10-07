import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
  database: drizzleAdapter(db, { provider: "pg", schema }),
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
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
