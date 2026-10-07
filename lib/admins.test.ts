import { afterEach, describe, expect, it } from "vitest";
import { adminEmails, isBootstrapAdminEmail } from "@/lib/env";

const original = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

describe("admin emails", () => {
  it("defaults to the founder address when the env var is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(adminEmails()).toEqual(["eric.leino@gmail.com"]);
    expect(isBootstrapAdminEmail("Eric.Leino@gmail.com")).toBe(true);
  });

  it("parses a comma-separated list and ignores blanks", () => {
    process.env.ADMIN_EMAILS = " eric.leino@gmail.com, Ops@BeCreative.demo ,,";
    expect(adminEmails()).toEqual(["eric.leino@gmail.com", "ops@becreative.demo"]);
    expect(isBootstrapAdminEmail("student@becreative.demo")).toBe(false);
  });

  it("treats an explicit empty list as no bootstrap admins", () => {
    process.env.ADMIN_EMAILS = "  ";
    expect(adminEmails()).toEqual([]);
  });
});
