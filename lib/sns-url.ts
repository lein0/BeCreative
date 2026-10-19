/** SNS confirmation endpoints are https://sns.<region>.amazonaws.com only. */
export function snsSubscribeUrlAllowed(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return /^sns\.[a-z0-9-]+\.amazonaws\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
