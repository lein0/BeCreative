import { describe, expect, it } from "vitest";
import { buildRawEmail } from "@/lib/email-mime";

describe("SES raw mail", () => {
  it("sends HTML and plain text together and names the configuration set", () => {
    const raw = buildRawEmail(
      { to: ["a@example.com"], subject: "Hello", text: "Plain", html: "<p>Rich</p>", headers: { "List-Unsubscribe": "<https://example.com/unsubscribe?token=1>" } },
      "BeCreative <hello@example.com>",
      "becreative-mail",
    );
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("<p>Rich</p>");
    expect(raw).toContain("Plain");
    expect(raw).toContain("X-SES-CONFIGURATION-SET: becreative-mail");
    expect(raw).toContain("List-Unsubscribe:");
  });
});
