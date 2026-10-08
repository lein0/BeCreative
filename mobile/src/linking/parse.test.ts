import { describe, expect, it } from "vitest";
import { hrefForDeepLink, parseDeepLink } from "./parse";

describe("deep links", () => {
  it("parses class, teacher, bio, pack, membership, and promo query params", () => {
    const klass = parseDeepLink("https://classes.becreative.app/c/scene-study?code=MAYA10&ref=ig&utm_source=instagram&session=sess-1");
    expect(klass).toMatchObject({ type: "class", slug: "scene-study", code: "MAYA10", ref: "ig", session: "sess-1", utm: { source: "instagram" } });
    expect(hrefForDeepLink(klass!)).toBe("/c/scene-study?code=MAYA10&ref=ig&session=sess-1&utm_source=instagram");

    expect(parseDeepLink("https://classes.becreative.app/t/maya-alvarez/")).toMatchObject({ type: "teacher", slug: "maya-alvarez" });
    expect(parseDeepLink("https://classes.becreative.app/t/maya-alvarez/bio?code=MAYA10")).toMatchObject({ type: "bio", slug: "maya-alvarez", code: "MAYA10" });
    expect(parseDeepLink("https://classes.becreative.app/t/maya-alvarez/p/scene-5")).toMatchObject({ type: "pack", teacherSlug: "maya-alvarez", packSlug: "scene-5" });
    expect(parseDeepLink("https://classes.becreative.app/t/lena-ortiz/m/bewell-monthly?code=BECREATIVE15")).toMatchObject({
      type: "membership",
      teacherSlug: "lena-ortiz",
      membershipSlug: "bewell-monthly",
      code: "BECREATIVE15",
    });
  });

  it("accepts the app scheme and auth links", () => {
    expect(parseDeepLink("becreative://c/cold-read?code=MAYA10")).toMatchObject({ type: "class", slug: "cold-read", code: "MAYA10" });
    expect(parseDeepLink("becreative://bookings?flow=membership&paid=1")).toMatchObject({ type: "bookings", flow: "membership", cancelled: false });
    expect(hrefForDeepLink(parseDeepLink("becreative://bookings?flow=membership&cancelled=1")!)).toBe("/bookings?cancelled=1");
    expect(parseDeepLink("https://classes.becreative.app/reset?token=reset-demo")).toMatchObject({ type: "reset", token: "reset-demo" });
    expect(hrefForDeepLink(parseDeepLink("https://classes.becreative.app/reset?token=reset-demo")!)).toBe("/reset?token=reset-demo");
    expect(hrefForDeepLink(parseDeepLink("https://classes.becreative.app/verify-email?token=verify:sam@x.com&email=sam@x.com")!)).toBe(
      "/verify-email?token=verify%3Asam%40x.com&email=sam%40x.com",
    );
    expect(parseDeepLink("https://classes.becreative.app/verify?token=verify-demo")).toMatchObject({ type: "verify", token: "verify-demo", path: "verify" });
    expect(hrefForDeepLink(parseDeepLink("becreative://verify?token=verify-demo")!)).toBe("/verify?token=verify-demo");
  });

  it("ignores teacher tools and unsafe urls", () => {
    expect(parseDeepLink("https://classes.becreative.app/teach/classes")).toBeNull();
    expect(parseDeepLink("https://classes.becreative.app/admin")).toBeNull();
    expect(parseDeepLink("https://classes.becreative.app/manage")).toBeNull();
    expect(parseDeepLink("javascript:alert(1)")).toBeNull();
    expect(parseDeepLink("//classes.becreative.app/c/scene-study")).toBeNull();
    expect(parseDeepLink("https://classes.becreative.app/c")).toBeNull();
  });
});
