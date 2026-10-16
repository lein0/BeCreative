"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { approveFeedback, dispatchFeedback, FeedbackError, mergeFeedback, rejectFeedback } from "@/lib/feedback-service";
import { canReviewFeedback } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function ids(formData: FormData) {
  return formData.getAll("ids").map((value) => String(value)).filter(Boolean);
}

async function reviewer() {
  const actor = await requireActor();
  if (!canReviewFeedback(actor.roles)) redirect("/");
  return actor;
}

export async function feedbackInboxAction(formData: FormData) {
  const actor = await reviewer();
  const command = text(formData, "command");
  const selected = ids(formData);
  const back = text(formData, "back") || "/admin/feedback";
  if (!selected.length) redirect(`${back}?error=${encodeURIComponent("Select at least one note.")}`);
  try {
    if (command === "approve") {
      for (const id of selected) {
        const result = await approveFeedback(actor, id);
        if (result.dispatch) after(() => dispatchFeedback(id));
      }
    } else if (command === "reject") {
      const reason = text(formData, "reason");
      for (const id of selected) await rejectFeedback(actor, id, reason);
    } else {
      throw new FeedbackError("Unknown action.");
    }
  } catch (error) {
    if (!(error instanceof FeedbackError)) throw error;
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/feedback");
  redirect(back);
}

export async function feedbackDetailAction(formData: FormData) {
  const actor = await reviewer();
  const id = text(formData, "id");
  const command = text(formData, "command");
  const back = `/admin/feedback/${id}`;
  try {
    if (command === "approve") {
      const result = await approveFeedback(actor, id, {
        title: text(formData, "title"),
        body: text(formData, "body"),
        type: text(formData, "type"),
        priority: text(formData, "priority"),
      });
      if (result.dispatch) after(() => dispatchFeedback(id));
    } else if (command === "reject") {
      await rejectFeedback(actor, id, text(formData, "reason"));
    } else if (command === "merge") {
      await mergeFeedback(actor, id, formData.getAll("merge").map((value) => String(value)));
    } else if (command === "resend") {
      after(() => dispatchFeedback(id));
    } else {
      throw new FeedbackError("Unknown action.");
    }
  } catch (error) {
    if (!(error instanceof FeedbackError)) throw error;
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/feedback");
  revalidatePath(back);
  redirect(back);
}
