import { handleMobileApi } from "@/lib/mobile-api";

function withCors(response: Response, request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Platform");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (request.method.toUpperCase() === "OPTIONS") return withCors(new Response(null, { status: 204 }), request);
  const { path } = await context.params;
  return withCors(await handleMobileApi(request, path ?? []), request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
