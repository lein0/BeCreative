import { cronAuthorized } from "@/lib/jobs";
import { scheduleLifecycle } from "@/lib/lifecycle";
import { escalateDueTickets } from "@/lib/support";
import { scheduleReminders, workJobs } from "@/lib/worker";

async function tick(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const reminders = await scheduleReminders();
  const lifecycle = await scheduleLifecycle();
  const jobs = await workJobs();
  const escalations = await escalateDueTickets();
  return Response.json({ ok: true, reminders, lifecycle, jobs, escalations });
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
