import { getActor } from "@/lib/actor";
import { addReply, FeedbackError } from "@/lib/feedback-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  try {
    await addReply(actor, id, body?.body ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof FeedbackError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Could not save the reply." }, { status: 500 });
  }
}
