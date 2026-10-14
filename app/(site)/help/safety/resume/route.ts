import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { openSafetyDraft, safetyDraftLoginPath, TICKET_DRAFT_COOKIE } from "@/lib/ticket-draft";

export async function GET() {
  const actor = await getActor();
  if (!actor) redirect(safetyDraftLoginPath());
  const jar = await cookies();
  const opened = await openSafetyDraft(actor.id, jar.get(TICKET_DRAFT_COOKIE)?.value);
  jar.delete(TICKET_DRAFT_COOKIE);
  if (!opened) redirect("/help/safety");
  redirect(`/help/tickets/${opened.id}`);
}
