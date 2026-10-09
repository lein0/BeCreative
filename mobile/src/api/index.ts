import { createLiveApi } from "./live";
import { bindMockToken, sharedMockApi } from "./mock";
import type { StudentApi } from "./types";

export type ApiMode = "mock" | "live";

export function resolveApiMode(value: string | undefined | null): ApiMode {
  return value === "live" ? "live" : "mock";
}

export function createStudentApi(options: {
  mode?: ApiMode;
  baseUrl?: string;
  getToken?: () => string | null;
  fetchImpl?: typeof fetch;
}): StudentApi {
  const mode = options.mode ?? "mock";
  if (mode === "live") {
    if (!options.baseUrl) throw new Error("A live API needs EXPO_PUBLIC_API_URL.");
    return createLiveApi({ baseUrl: options.baseUrl, getToken: options.getToken ?? (() => null), fetchImpl: options.fetchImpl });
  }
  if (options.getToken) bindMockToken(options.getToken);
  return sharedMockApi();
}

export { createMockApi, sharedMockApi } from "./mock";
export { paths, API_PREFIX } from "./paths";
export { ApiError } from "./types";
export type { StudentApi, TrackEvent, ClassCard, ClassDetail, BookingRecord } from "./types";
