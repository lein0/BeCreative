import { describe, expect, it } from "vitest";
import { markNotificationRead } from "./read";

describe("inbox read state", () => {
  it("marks the tapped notification read without waiting for a remount", () => {
    const items = [
      { id: "note-1", readAt: null },
      { id: "note-2", readAt: null },
    ];
    const next = markNotificationRead(items, "note-1", "2026-10-09T12:00:00.000Z");
    expect(next[0]?.readAt).toBe("2026-10-09T12:00:00.000Z");
    expect(next[1]?.readAt).toBeNull();
  });
});
