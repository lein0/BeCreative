import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { db } from "@/lib/db";
import { teachers, userRoles } from "@/lib/db/schema";
import { canEditTeacherContent } from "@/lib/permissions";

export type Actor = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  roles: Role[];
  isDemo: boolean;
};

export async function getActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, session.user.id));
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    roles: roles.map((role) => role.role as Role),
    isDemo: Boolean(session.user.isDemo),
  };
}

export async function requireActor() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function loadTeacherAccess(teacherId: string) {
  const actor = await requireActor();
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher) return null;
  const isOwn = teacher.userId === actor.id;
  if (!canEditTeacherContent(actor.roles, isOwn)) redirect("/");
  return { actor, teacher, delegated: !isOwn };
}
