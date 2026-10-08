import { getActor } from "@/lib/actor";
import { listPins } from "@/lib/feedback-service";
import { feedbackRole } from "@/lib/feedback-rules";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ pins: [] }, { status: 401 });
  if (!feedbackRole(actor.roles)) return Response.json({ pins: [] }, { status: 403 });
  const route = new URL(request.url).searchParams.get("route") ?? "";
  if (!route.startsWith("/")) return Response.json({ pins: [] });
  const pins = await listPins(actor.id, route);
  return Response.json({ pins });
}
