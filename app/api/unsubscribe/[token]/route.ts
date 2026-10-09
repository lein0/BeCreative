import { unsubscribeByToken } from "@/lib/notifications";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ok = await unsubscribeByToken(decodeURIComponent(token));
  if (!ok) return new Response("Link not found", { status: 404 });
  return new Response("Unsubscribed", { status: 200 });
}
