import { expandLink } from "@/lib/short-links";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const url = await expandLink(code);
  if (!url) return new Response("Link not found", { status: 404 });
  return Response.redirect(url, 302);
}
