import { describe, expect, it } from "vitest";
import { googleBrowserClientId } from "./google-client";

describe("google browser client id", () => {
  const env = {
    web: "web.apps.googleusercontent.com",
    ios: "ios.apps.googleusercontent.com",
    android: "android.apps.googleusercontent.com",
  };

  it("uses the web client on iOS and Android even when native client ids are set", () => {
    expect(googleBrowserClientId({ ...env, platform: "ios" })).toBe(env.web);
    expect(googleBrowserClientId({ ...env, platform: "android" })).toBe(env.web);
    expect(googleBrowserClientId({ ...env, platform: "web" })).toBe(env.web);
  });

  it("does not fall back to a native client id", () => {
    expect(googleBrowserClientId({ platform: "ios", ios: env.ios, web: "  " })).toBeNull();
    expect(googleBrowserClientId({ platform: "android", android: env.android })).toBeNull();
    expect(googleBrowserClientId({ platform: "web", ios: env.ios })).toBeNull();
  });
});
