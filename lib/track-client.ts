export async function trackClient(input: {
  name: string;
  path?: string;
  platform?: "web" | "ios" | "android";
  anonymousId?: string;
  properties?: Record<string, string>;
  consent?: boolean;
}) {
  await fetch("/api/v1/track", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-platform": input.platform || "web" },
    body: JSON.stringify(input),
  });
}
