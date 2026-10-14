import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function locationFor(path: string) {
  const response = proxy(new NextRequest(`http://localhost${path}`));
  return response.headers.get("location");
}

describe("auth return paths", () => {
  it("sends ticket links back through login", () => {
    expect(locationFor("/help/tickets/t1")).toBe("http://localhost/login?next=%2Fhelp%2Ftickets%2Ft1");
    expect(locationFor("/help/tickets")).toBe("http://localhost/login?next=%2Fhelp%2Ftickets");
  });

  it("leaves the public safety form reachable", () => {
    expect(locationFor("/help/safety")).toBeNull();
  });
});
