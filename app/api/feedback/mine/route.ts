import { getActor } from "@/lib/actor";
import { listMine } from "@/lib/feedback-service";
import { feedbackRole } from "@/lib/feedback-rules";

export async function GET() {
  const actor = await getActor();
  if (!actor) return Response.json({ items: [] }, { status: 401 });
  if (!feedbackRole(actor.roles)) return Response.json({ items: [] }, { status: 403 });
  const items = await listMine(actor.id);
  return Response.json({
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      type: item.type,
      priority: item.priority,
      status: item.status,
      route: item.route,
      url: item.url,
      fixPrUrl: item.fixPrUrl,
      unread: item.unread,
      createdAt: item.createdAt,
      events: item.events.map((event) => ({
        id: event.id,
        kind: event.kind,
        body: event.body,
        actorName: event.actorName,
        createdAt: event.createdAt,
      })),
    })),
  });
}
