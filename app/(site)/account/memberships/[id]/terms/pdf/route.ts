import { requireActor } from "@/lib/actor";
import { membershipTerms } from "@/lib/renewal";
import { textPdf } from "@/lib/renewal-pdf";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const actor = await requireActor();
  const terms = await membershipTerms(id, actor.id);
  if (!terms) return new Response("Not found", { status: 404 });
  const from = `From: ${terms.legal.platformName} <${terms.legal.notificationsEmail}> on behalf of ${terms.teacher.studioName || "Teacher"}`;
  const pdf = textPdf(terms.mail.subject, `${from}\n\n${terms.mail.text}`);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="membership-terms.pdf"`,
    },
  });
}
