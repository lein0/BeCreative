import { getActor } from "@/lib/actor";
import { canEditTeacherContent } from "@/lib/permissions";
import { db } from "@/lib/db";
import { teachers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { roster } from "@/lib/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in", { status: 401 });
  const { id } = await context.params;
  const data = await roster(id);
  if (!data?.klass) return new Response("Not found", { status: 404 });
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, data.klass.teacherId)).limit(1);
  if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return new Response("Forbidden", { status: 403 });
  const lines = ["name,email,status,payment,checked_in"];
  for (const person of data.people) {
    const name = person.student?.name || person.booking.guestName || "";
    const email = person.student?.email || person.booking.guestEmail || "";
    lines.push([name, email, person.booking.status, person.order?.status ?? person.booking.source, person.link.checkedIn ? "yes" : "no"].map(csv).join(","));
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=roster.csv" } });
}

function csv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
