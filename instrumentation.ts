import { captureException } from "@/lib/sentry";

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  await captureException(error, {
    path: request.path,
    method: request.method,
    route: context.routePath,
    type: context.routeType,
  });
}
