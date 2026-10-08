import { applyFixerStatus, assertFixerStatus, FeedbackError } from "@/lib/feedback-service";
import { bearerMatches } from "@/lib/feedback-webhook";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.FEEDBACK_CALLBACK_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: string;
    fix_pr_url?: string;
    fixPrUrl?: string;
    fix_notes?: string;
    fixNotes?: string;
    comment?: string;
  } | null;
  if (!body?.status) return Response.json({ error: "Status is required." }, { status: 400 });
  try {
    const status = assertFixerStatus(body.status);
    const updated = await applyFixerStatus(id, {
      status,
      fixPrUrl: body.fix_pr_url ?? body.fixPrUrl ?? null,
      fixNotes: body.fix_notes ?? body.fixNotes ?? null,
      comment: body.comment ?? null,
    });
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof FeedbackError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Could not update status." }, { status: 500 });
  }
}
