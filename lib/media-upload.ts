import { eq } from "drizzle-orm";
import type { Role } from "@/lib/constants";
import { db } from "@/lib/db";
import { classes, teachers } from "@/lib/db/schema";
import { canEditTeacherContent } from "@/lib/permissions";

export async function mediaUploadAllowed(actor: { id: string; roles: Role[] }, input: { classId?: string; teacherId?: string }) {
  if (!input.classId && !input.teacherId) return { ok: false as const, status: 403, error: "Choose a class to attach this file." };
  let ownerUserId: string | null = null;
  if (input.classId) {
    const [klass] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, input.classId)).limit(1);
    if (!klass) return { ok: false as const, status: 404, error: "Class not found." };
    if (input.teacherId && input.teacherId !== klass.teacherId) return { ok: false as const, status: 403, error: "That class belongs to another studio." };
    const [teacher] = await db.select({ userId: teachers.userId }).from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
    ownerUserId = teacher?.userId ?? null;
  } else if (input.teacherId) {
    const [teacher] = await db.select({ userId: teachers.userId }).from(teachers).where(eq(teachers.id, input.teacherId)).limit(1);
    if (!teacher) return { ok: false as const, status: 404, error: "Studio not found." };
    ownerUserId = teacher.userId;
  }
  if (!canEditTeacherContent(actor.roles, ownerUserId === actor.id)) return { ok: false as const, status: 403, error: "You can't upload files for this studio." };
  return { ok: true as const };
}
