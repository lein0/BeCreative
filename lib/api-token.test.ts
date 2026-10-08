import { describe, expect, it } from "vitest";
import { hashToken, parseBearer, tokenUsable } from "@/lib/api-token";

describe("API token auth", () => {
  it("reads a bearer token and rejects anything else", () => {
    expect(parseBearer("Bearer abc.def")).toBe("abc.def");
    expect(parseBearer("bearer tok")).toBe("tok");
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });

  it("hashes stably and rejects expired or revoked tokens", () => {
    expect(hashToken("bc_demo")).toBe(hashToken("bc_demo"));
    expect(hashToken("bc_demo")).not.toBe(hashToken("bc_other"));
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(tokenUsable({ expiresAt: future, revokedAt: null })).toBe(true);
    expect(tokenUsable({ expiresAt: past, revokedAt: null })).toBe(false);
    expect(tokenUsable({ expiresAt: future, revokedAt: new Date() })).toBe(false);
  });
});
