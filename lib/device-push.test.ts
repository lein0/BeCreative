import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDevicePush } from "@/lib/device-push";

const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const saved = {
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
  APNS_KEY_ID: process.env.APNS_KEY_ID,
  APNS_TEAM_ID: process.env.APNS_TEAM_ID,
  APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID,
  APNS_PRIVATE_KEY: process.env.APNS_PRIVATE_KEY,
  APNS_PRODUCTION: process.env.APNS_PRODUCTION,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("native device push", () => {
  it("posts Expo, FCM, and APNs tokens when each provider is configured", async () => {
    process.env.FCM_SERVER_KEY = "fcm-test-key";
    process.env.APNS_KEY_ID = "KEYID123";
    process.env.APNS_TEAM_ID = "TEAMID123";
    process.env.APNS_BUNDLE_ID = "com.becreative.app";
    process.env.APNS_PRIVATE_KEY = privateKey;
    delete process.env.APNS_PRODUCTION;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendDevicePush(
      [
        { token: "ExponentPushToken[abc]", provider: "expo" },
        { token: "fcm-device", provider: "fcm" },
        { token: "apns-device", provider: "apns" },
      ],
      "Class reminder",
      "Starts soon",
      "/bookings",
    );
    expect(result).toMatchObject({ sent: 3, skipped: 0, ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls.map((call) => ({ url: String(call[0]), init: call[1]! }));
    const expo = calls[0]!;
    const fcm = calls[1]!;
    const apns = calls[2]!;
    expect(expo.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(fcm.url).toBe("https://fcm.googleapis.com/fcm/send");
    expect(fcm.init.headers).toMatchObject({ authorization: "key=fcm-test-key" });
    expect(JSON.parse(String(fcm.init.body))).toMatchObject({ to: "fcm-device", notification: { title: "Class reminder", body: "Starts soon" }, data: { url: "/bookings" } });
    expect(apns.url).toBe("https://api.sandbox.push.apple.com/3/device/apns-device");
    const headers = apns.init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("com.becreative.app");
    const jwt = headers.authorization.replace(/^bearer /i, "");
    const [encodedHeader, encodedPayload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(encodedHeader!, "base64url").toString())).toMatchObject({ alg: "ES256", kid: "KEYID123" });
    expect(JSON.parse(Buffer.from(encodedPayload!, "base64url").toString()).iss).toBe("TEAMID123");
    const raw = Buffer.from(signature!, "base64url");
    expect(raw).toHaveLength(64);
    const verify = createVerify("SHA256");
    verify.update(`${encodedHeader}.${encodedPayload}`);
    verify.end();
    expect(verify.verify({ key: keys.publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
  });

  it("leaves native tokens unsent when their credentials are unset", async () => {
    delete process.env.FCM_SERVER_KEY;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_BUNDLE_ID;
    delete process.env.APNS_PRIVATE_KEY;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendDevicePush([{ token: "native", provider: "apns" }, { token: "native-fcm", provider: "fcm" }], "Hi", "There");
    expect(result).toEqual({ sent: 0, skipped: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
