import { getActor } from "@/lib/actor";
import { markAuthorRead } from "@/lib/feedback-service";
import { feedbackRole } from "@/lib/feedback-rules";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !feedbackRole(actor.roles)) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  await markAuthorRead(actor.id, id);
  return Response.json({ ok: true });
}
