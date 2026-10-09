import { cronAuthorized } from "@/lib/jobs";
import { scheduleReminders, workJobs } from "@/lib/worker";

async function tick(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const reminders = await scheduleReminders();
  const jobs = await workJobs();
  return Response.json({ ok: true, reminders, jobs });
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
