import { Suspense } from "react";
import { FeedbackChrome } from "@/components/feedback-widget";
import { getActor } from "@/lib/actor";
import { authorUnreadCount } from "@/lib/feedback-service";
import { feedbackRole } from "@/lib/feedback-rules";

export function FeedbackSlot({ mobileFloat = false }: { mobileFloat?: boolean }) {
  return (
    <Suspense fallback={null}>
      <Mount mobileFloat={mobileFloat} />
    </Suspense>
  );
}

async function Mount({ mobileFloat }: { mobileFloat: boolean }) {
  const actor = await getActor();
  if (!actor || !feedbackRole(actor.roles)) return null;
  const unread = await authorUnreadCount(actor.id);
  return <FeedbackChrome mobileFloat={mobileFloat} initialUnread={unread} />;
}
