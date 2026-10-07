import { eq, sql } from "drizzle-orm";
import { adminEmails, isBootstrapAdminEmail } from "@/lib/env";
import { db } from "@/lib/db";
import { user, userRoles } from "@/lib/db/schema";

export async function grantAdminRole(userId: string) {
  await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role: "admin" }).onConflictDoNothing();
}

export async function ensureAdminByEmail(email: string) {
  if (!isBootstrapAdminEmail(email)) return false;
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  if (!row) return false;
  await grantAdminRole(row.id);
  return true;
}

export async function ensureBootstrapAdmins() {
  const now = new Date();
  for (const email of adminEmails()) {
    const [existing] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    let userId = existing?.id;
    if (!existing) {
      userId = crypto.randomUUID();
      await db.insert(user).values({
        id: userId,
        name: email,
        email,
        emailVerified: true,
        isDemo: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role: "student" }).onConflictDoNothing();
      console.log(`Created ${email} as admin with no password. Use Forgot password or Google to sign in.`);
    } else if (!existing.emailVerified) {
      await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, existing.id));
    }
    if (userId) await grantAdminRole(userId);
    console.log(`Admin role ensured for ${email}.`);
  }
}
