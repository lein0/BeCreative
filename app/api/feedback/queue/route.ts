import { listQueue } from "@/lib/feedback-service";
import { isFeedbackStatus } from "@/lib/feedback-rules";
import { bearerMatches } from "@/lib/feedback-webhook";

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.FEEDBACK_CALLBACK_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = new URL(request.url).searchParams.get("status") || "approved";
  if (!isFeedbackStatus(status)) return Response.json({ error: "Unknown status." }, { status: 400 });
  const items = await listQueue(status);
  return Response.json({ items });
}
