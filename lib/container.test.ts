import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("container uploads", () => {
  it("creates a local upload directory the nextjs user can write", () => {
    const docker = readFileSync("Dockerfile", "utf8");
    const runner = docker.slice(docker.indexOf("AS runner"));
    const userAt = runner.indexOf("USER nextjs");
    const beforeUser = runner.slice(0, userAt);
    expect(beforeUser).toContain("mkdir -p /app/data/uploads");
    expect(beforeUser).toContain("chown -R nextjs:nodejs /app/data/uploads");
  });
});
