import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
  createClassAction: async () => null,
}));

const { ClassForm } = await import("@/components/class-form");

const categories = [{ id: "acting", name: "Acting", parentId: null }];

function checkbox(html: string, name: string) {
  const match = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  return match?.[0] ?? "";
}

describe("class edit flags", () => {
  it("restores series, intro, waitlist, and publish from the stored class", () => {
    const html = renderToStaticMarkup(createElement(ClassForm, {
      teacherId: "teacher-1",
      classId: "class-1",
      categories,
      defaultStart: "2026-10-20",
      initial: {
        title: "Scene study",
        description: "Updated copy",
        delivery: "virtual",
        virtualLink: "https://meet.example/room",
        seriesBooking: true,
        firstFree: true,
        waitlist: false,
        publish: false,
      },
    }));
    expect(checkbox(html, "seriesBooking")).toContain("checked");
    expect(checkbox(html, "firstFree")).toContain("checked");
    expect(checkbox(html, "waitlist")).not.toContain("checked");
    expect(checkbox(html, "publish")).not.toContain("checked");
  });

  it("keeps the new-class defaults when nothing is stored yet", () => {
    const html = renderToStaticMarkup(createElement(ClassForm, {
      teacherId: "teacher-1",
      categories,
      defaultStart: "2026-10-20",
    }));
    expect(checkbox(html, "seriesBooking")).not.toContain("checked");
    expect(checkbox(html, "firstFree")).not.toContain("checked");
    expect(checkbox(html, "waitlist")).toContain("checked");
    expect(checkbox(html, "publish")).toContain("checked");
  });
});
