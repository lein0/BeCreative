import { getActor } from "@/lib/actor";
import { renderEmail } from "@/lib/email-templates";
import { appOrigin } from "@/lib/env";
import { canViewPlatformStats } from "@/lib/permissions";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") {
    const actor = await getActor();
    if (!actor || !canViewPlatformStats(actor.roles)) return new Response("Forbidden", { status: 403 });
  }
  const { id } = await context.params;
  const template = decodeURIComponent(id);
  const rendered = await renderEmail(template, {
    name: "Jules",
    title: "Scene Study",
    body: "Tuesday at 7pm at the studio. Your seat is reserved.",
    href: `${appOrigin()}/bookings`,
    detail: "3 bookings this week, $90 to the studio, top link: maya-alvarez.",
  }, "becreative");
  return new Response(rendered.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
