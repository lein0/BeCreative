import { createLiveApi } from "./live";
import { sharedMockApi } from "./mock";
import type { PlatformName, StudentApi } from "./types";

export type ApiMode = "mock" | "live";

export function resolveApiMode(mode: string | undefined | null, apiUrl?: string | undefined | null): ApiMode {
  if (mode === "mock") return "mock";
  if (apiUrl && apiUrl.trim()) return "live";
  return "mock";
}

export function createStudentApi(options: {
  mode?: ApiMode;
  baseUrl?: string;
  getToken?: () => string | null;
  getPlatform?: () => PlatformName;
  fetchImpl?: typeof fetch;
} = {}): StudentApi {
  const mode = options.mode ?? "mock";
  if (mode === "live") {
    if (!options.baseUrl) throw new Error("A live API needs EXPO_PUBLIC_API_URL.");
    return createLiveApi({
      baseUrl: options.baseUrl,
      getToken: options.getToken ?? (() => null),
      getPlatform: options.getPlatform,
      fetchImpl: options.fetchImpl,
    });
  }
  return sharedMockApi();
}

export { createMockApi, sharedMockApi } from "./mock";
export { paths, API_PREFIX, documentedPaths } from "./paths";
export { ApiError } from "./types";
export type { StudentApi, PublicClass, ClassDetail, CheckoutResult, BookingListItem } from "./types";
