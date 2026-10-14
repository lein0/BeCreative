import { describe, expect, it } from "vitest";
import { clientAddress, rateLimitAddress } from "@/lib/client-ip";

describe("client address for rate limits", () => {
  it("keeps the proxy-appended address when the client prepends another hop", () => {
    expect(clientAddress("1.2.3.4, 203.0.113.10")).toBe("203.0.113.10");
    expect(clientAddress("9.9.9.9, 203.0.113.10, 10.1.2.3")).toBe("203.0.113.10");
    expect(clientAddress("203.0.113.10")).toBe("203.0.113.10");
  });

  it("does not give each invalid header its own bucket", () => {
    const headers = (value: string) => ({ get: (name: string) => (name === "x-forwarded-for" ? value : null) });
    expect(rateLimitAddress(headers("not-an-ip"))).toBe("unknown");
    expect(rateLimitAddress(headers("also-not-an-ip"))).toBe("unknown");
    expect(rateLimitAddress({ get: () => null })).toBe("unknown");
  });
});
