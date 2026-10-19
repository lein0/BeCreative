type RawMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

function clean(value: string) {
  return value.replace(/[\r\n\u0085\u2028\u2029]+/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** ASCII headers stay literal. Anything else is RFC 2047 so a class title cannot split the header. */
export function headerValue(value: string) {
  const cleaned = clean(value);
  if (/^[\t\x20-\x7E]*$/.test(cleaned)) return cleaned;
  const bytes = Buffer.from(cleaned, "utf8");
  const words: string[] = [];
  for (let index = 0; index < bytes.length; index += 45) {
    words.push(`=?UTF-8?B?${bytes.subarray(index, index + 45).toString("base64")}?=`);
  }
  return words.join(" ");
}

export function buildRawEmail(message: RawMessage, from: string, configurationSet?: string) {
  const headers = [
    `From: ${headerValue(from)}`,
    `To: ${message.to.map(headerValue).join(", ")}`,
    `Subject: ${headerValue(message.subject)}`,
    ...Object.entries(message.headers ?? {}).map(([key, value]) => `${clean(key)}: ${headerValue(value)}`),
  ];
  if (configurationSet) headers.push(`X-SES-CONFIGURATION-SET: ${headerValue(configurationSet)}`);
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
