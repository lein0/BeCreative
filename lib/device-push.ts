import { createPrivateKey, createSign } from "node:crypto";

type PushToken = { token: string; provider: string };

function isExpo(item: PushToken) {
  return item.provider === "expo" || item.token.startsWith("ExponentPushToken");
}

export function fcmConfigured() {
  return Boolean(process.env.FCM_SERVER_KEY);
}

export function apnsConfigured() {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID && process.env.APNS_PRIVATE_KEY);
}

function base64url(value: Buffer | string) {
  return (typeof value === "string" ? Buffer.from(value) : value).toString("base64url");
}

/** Apple expects the raw 64-byte R||S form, not the DER signature Node returns. */
export function ecdsaDerToRaw(der: Buffer, size = 32) {
  let offset = 2;
  if (der[0] !== 0x30) throw new Error("APNs signature was not DER.");
  if ((der[1] ?? 0) & 0x80) offset = 2 + ((der[1] ?? 0) & 0x7f);
  const readInt = () => {
    if (der[offset] !== 0x02) throw new Error("APNs signature was not DER.");
    const length = der[offset + 1] ?? 0;
    const bytes = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    return bytes.length > size ? bytes.subarray(bytes.length - size) : bytes;
  };
  const r = readInt();
  const s = readInt();
  const raw = Buffer.alloc(size * 2);
  raw.set(r, size - r.length);
  raw.set(s, size * 2 - s.length);
  return raw;
}

export function signApnsJwt(privateKeyPem: string, keyId: string, teamId: string, issuedAt = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: issuedAt }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const raw = ecdsaDerToRaw(signer.sign(createPrivateKey(privateKeyPem.replace(/\\n/g, "\n"))));
  return `${unsigned}.${raw.toString("base64url")}`;
}

export async function sendDevicePush(tokens: PushToken[], title: string, body: string, url?: string) {
  const expo = tokens.filter(isExpo);
  const fcm = tokens.filter((item) => item.provider === "fcm" && !isExpo(item));
  const apns = tokens.filter((item) => item.provider === "apns" && !isExpo(item));
  let sent = 0;
  let skipped = tokens.length - expo.length - fcm.length - apns.length;
  let ok = true;

  if (expo.length) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(expo.map((item) => ({ to: item.token, title, body, sound: "default", ...(url ? { data: { url } } : {}) }))),
    });
    sent += expo.length;
    ok = response.ok;
  }

  if (fcm.length && fcmConfigured()) {
    for (const item of fcm) {
      const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `key=${process.env.FCM_SERVER_KEY}` },
        body: JSON.stringify({ to: item.token, notification: { title, body }, ...(url ? { data: { url } } : {}) }),
      });
      sent += 1;
      ok = ok && response.ok;
    }
  } else skipped += fcm.length;

  if (apns.length && apnsConfigured()) {
    const jwt = signApnsJwt(process.env.APNS_PRIVATE_KEY!, process.env.APNS_KEY_ID!, process.env.APNS_TEAM_ID!);
    const host = process.env.APNS_PRODUCTION === "true" || process.env.APNS_PRODUCTION === "1" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    for (const item of apns) {
      const response = await fetch(`${host}/3/device/${encodeURIComponent(item.token)}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": process.env.APNS_BUNDLE_ID!,
          "apns-push-type": "alert",
          "content-type": "application/json",
        },
        body: JSON.stringify({ aps: { alert: { title, body } }, ...(url ? { url } : {}) }),
      });
      sent += 1;
      ok = ok && response.ok;
    }
  } else skipped += apns.length;

  if (!sent) return { sent: 0, skipped: tokens.length };
  return { sent, ok, skipped };
}
