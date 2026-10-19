import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
  leadAction: async () => undefined,
}));

const { default: ImportPage } = await import("@/app/(site)/crm/import/page");

describe("lead import page", () => {
  it("shows a CSV import error instead of a blank success", async () => {
    const page = await ImportPage({ searchParams: Promise.resolve({ error: "The file is empty." }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("The file is empty.");
    expect(html).toContain('name="command"');
  });
});
