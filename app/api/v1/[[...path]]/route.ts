import { handleMobileApi } from "@/lib/mobile-api";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return handleMobileApi(request, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
