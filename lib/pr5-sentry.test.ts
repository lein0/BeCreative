import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../instrumentation";
import { reportErrorAction } from "@/lib/report-error";

describe("sentry wiring", () => {
  const original = process.env.SENTRY_DSN;

  afterEach(() => {
    if (original === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = original;
    vi.unstubAllGlobals();
  });

  it("sends an envelope from the request error hook when a DSN is set", async () => {
    process.env.SENTRY_DSN = "https://public-key@o1.ingest.sentry.io/123";
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await onRequestError(new Error("render failed"), { path: "/help", method: "GET" }, { routePath: "/help", routeType: "render" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(first[0])).toContain("/api/123/envelope/");
    fetchMock.mockClear();
    await reportErrorAction("client failed", "digest-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(second[1].body);
    expect(body).toContain("client failed");
    expect(body).toContain("digest-1");
  });
});
