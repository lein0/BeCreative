import { after } from "next/server";
import { getActor } from "@/lib/actor";
import { createFeedback, dispatchFeedback, FeedbackError } from "@/lib/feedback-service";
import { deviceType, feedbackRole, MAX_SCREENSHOT_BYTES } from "@/lib/feedback-rules";
import { putStoredObject } from "@/lib/storage";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!feedbackRole(actor.roles)) return Response.json({ error: "Feedback is limited to admins and account managers." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("screenshot");
  let screenshotKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SCREENSHOT_BYTES) return Response.json({ error: "Screenshot is over 12 MB." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    screenshotKey = `feedback/${new Date().getFullYear()}/${crypto.randomUUID()}.jpg`;
    await putStoredObject(screenshotKey, bytes, "image/jpeg");
  }
  const width = Number(form.get("width") ?? 0);
  try {
    const created = await createFeedback({
      authorUserId: actor.id,
      authorName: actor.name,
      authorEmail: actor.email,
      roles: actor.roles,
      type: String(form.get("type") ?? ""),
      priority: String(form.get("priority") ?? ""),
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      url: String(form.get("url") ?? ""),
      route: String(form.get("route") ?? ""),
      device: deviceType(width),
      viewport: JSON.parse(String(form.get("viewport") ?? "null")),
      marks: JSON.parse(String(form.get("marks") ?? "[]")),
      targets: JSON.parse(String(form.get("targets") ?? "[]")),
      screenshotKey,
    });
    if (created.status === "approved") {
      after(() => dispatchFeedback(created.id));
    }
    return Response.json(created);
  } catch (error) {
    if (error instanceof FeedbackError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Feedback details were not valid JSON." }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
