import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { experimentSubject } from "@/lib/anon";
import { subjectFromCookies } from "@/lib/experiments";
import { proxy } from "@/proxy";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, header: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "bc_anon" && state.cookie ? { value: state.cookie } : undefined),
  }),
  headers: async () => ({
    get: (name: string) => (name === "x-bc-anon" ? state.header : null),
  }),
}));

describe("first-visit experiment subject", () => {
  it("uses the id minted on this request instead of the user id or anonymous", async () => {
    expect(experimentSubject({ header: "minted-anon", userId: "user-1" })).toBe("minted-anon");
    expect(experimentSubject({ cookie: "cookie-anon", header: "other", userId: "user-1" })).toBe("cookie-anon");
    expect(experimentSubject({ userId: "user-1" })).toBe("user-1");
    expect(experimentSubject({})).toBe("anonymous");
    state.cookie = undefined;
    state.header = "minted-anon";
    await expect(subjectFromCookies("user-1")).resolves.toBe("minted-anon");
    state.cookie = "cookie-anon";
    await expect(subjectFromCookies("user-1")).resolves.toBe("cookie-anon");
  });

  it("writes one anonymous id onto the cookie and the forwarded request", () => {
    const response = proxy(new NextRequest("http://localhost:3000/c/pottery"));
    const cookie = response.cookies.get("bc_anon")?.value;
    expect(cookie).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-middleware-request-x-bc-anon")).toBe(cookie);
  });

  it("keeps an anonymous id that is already on the request", () => {
    const request = new NextRequest("http://localhost:3000/c/pottery", { headers: { cookie: "bc_anon=already-there" } });
    const response = proxy(request);
    expect(response.cookies.get("bc_anon")).toBeUndefined();
    expect(response.headers.get("x-middleware-request-x-bc-anon")).toBeNull();
  });
});
