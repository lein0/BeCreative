type RawMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

function clean(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildRawEmail(message: RawMessage, from: string, configurationSet?: string) {
  const headers = [
    `From: ${clean(from)}`,
    `To: ${message.to.map(clean).join(", ")}`,
    `Subject: ${clean(message.subject)}`,
    ...Object.entries(message.headers ?? {}).map(([key, value]) => `${clean(key)}: ${clean(value)}`),
  ];
  if (configurationSet) headers.push(`X-SES-CONFIGURATION-SET: ${clean(configurationSet)}`);
  headers.push("MIME-Version: 1.0");
  if (!message.html) {
    return [...headers, "Content-Type: text/plain; charset=UTF-8", "", message.text].join("\r\n");
  }
  const boundary = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    message.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
