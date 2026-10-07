import { getActor } from "@/lib/actor";
import { canManageLeads } from "@/lib/permissions";
import { leadToCsv } from "@/lib/crm";
import { db } from "@/lib/db";
import { leads, user } from "@/lib/db/schema";

export async function GET() {
  const actor = await getActor();
  if (!actor || !canManageLeads(actor.roles)) return new Response("Forbidden", { status: 403 });
  const [rows, people] = await Promise.all([db.select().from(leads), db.select().from(user)]);
  const reps = new Map(people.map((person) => [person.id, person.email]));
  return new Response(leadToCsv(rows, reps), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=leads.csv" } });
}
