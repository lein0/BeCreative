export async function sendDevicePush(tokens: { token: string; provider: string }[], title: string, body: string, url?: string) {
  const expo = tokens.filter((item) => item.provider === "expo" || item.token.startsWith("ExponentPushToken"));
  if (!expo.length) return { sent: 0, skipped: tokens.length };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(expo.map((item) => ({ to: item.token, title, body, sound: "default", ...(url ? { data: { url } } : {}) }))),
  });
  return { sent: expo.length, ok: response.ok, skipped: tokens.length - expo.length };
}
