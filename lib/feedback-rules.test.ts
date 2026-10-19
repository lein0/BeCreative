import { describe, expect, it } from "vitest";
import {
  capturePixelRatio,
  clipElementText,
  feedbackRole,
  initialFeedbackStatus,
  isFixerStatus,
  isSensitiveFeedback,
  parseMarks,
  shouldDispatch,
} from "@/lib/feedback-rules";

describe("feedback gating", () => {
  it("hides the tool from students and teachers", () => {
    expect(feedbackRole([])).toBeNull();
    expect(feedbackRole(["student"])).toBeNull();
    expect(feedbackRole(["teacher", "student"])).toBeNull();
  });

  it("approves and dispatches admin notes immediately", () => {
    expect(feedbackRole(["admin"])).toBe("admin");
    expect(feedbackRole(["admin", "account_manager"])).toBe("admin");
    expect(initialFeedbackStatus("admin")).toBe("approved");
    expect(shouldDispatch("approved")).toBe(true);
  });

  it("holds account manager notes for review", () => {
    expect(feedbackRole(["account_manager", "teacher"])).toBe("account_manager");
    expect(initialFeedbackStatus("account_manager")).toBe("pending_review");
    expect(shouldDispatch("pending_review")).toBe(false);
  });

  it("lets the fixer move work without approving it", () => {
    expect(isFixerStatus("queued")).toBe(true);
    expect(isFixerStatus("needs_info")).toBe(true);
    expect(isFixerStatus("in_progress")).toBe(true);
    expect(isFixerStatus("fixed")).toBe(true);
    expect(isFixerStatus("approved")).toBe(false);
    expect(isFixerStatus("rejected")).toBe(false);
  });
});

describe("feedback capture limits", () => {
  it("caps the screenshot pixel ratio at 1.5", () => {
    expect(capturePixelRatio(3)).toBe(1.5);
    expect(capturePixelRatio(1)).toBe(1);
    expect(capturePixelRatio(Number.NaN)).toBe(1);
  });

  it("keeps element text to 160 characters", () => {
    expect(clipElementText(`  ${"a".repeat(200)}  `)).toHaveLength(160);
  });

  it("drops marks that are not a known shape", () => {
    expect(parseMarks([{ type: "box", x: 1, y: 2, w: 3, h: 4 }, { type: "scribble" }, "nope"])).toEqual([
      { type: "box", x: 1, y: 2, w: 3, h: 4 },
    ]);
  });
});

describe("sensitive feedback", () => {
  it("flags billing, auth, roles, promo funding, and admin settings", () => {
    expect(isSensitiveFeedback({ route: "/teach/billing", body: "The table is cramped" })).toBe(true);
    expect(isSensitiveFeedback({ route: "/admin/settings", body: "Label" })).toBe(true);
    expect(isSensitiveFeedback({ route: "/explore", body: "Stripe payout looks wrong" })).toBe(true);
    expect(isSensitiveFeedback({ route: "/explore", body: "Map", targets: [{ selector: "p", text: "Platform fee" }] })).toBe(true);
    expect(isSensitiveFeedback({ route: "/admin/promos", body: "Copy" })).toBe(true);
    expect(isSensitiveFeedback({ route: "/explore", body: "The neighborhood label overlaps the pin" })).toBe(false);
  });
});
