export function logEvent(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));
}
