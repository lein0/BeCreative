import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PromoRule } from "@/lib/pricing";
import {
  classPromoDecision,
  containedMediaPath,
  MAX_UPLOAD_BYTES,
  paidCheckoutSendsBookingEmail,
  passwordResetIdentifier,
  publicListingVisible,
  studioCanSell,
  uploadExceedsLimit,
} from "@/lib/review-rules";
import { errorRedirectPath } from "@/lib/checkout-rules";

const promo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  code: "ONCE",
  active: true,
  discountType: "percent",
  percentOffBps: 1000,
  amountOffCents: 0,
  startsAt: null,
  endsAt: null,
  maxRedemptions: 2,
  maxPerCustomer: 1,
  firstTimeOnly: true,
  minPurchaseCents: 0,
  funding: "teacher",
  platformSharePercent: 0,
  appliesTo: "all",
  teacherId: "t1",
  classIds: [],
  categoryIds: [],
  packIds: [],
  membershipIds: [],
  cities: [],
  ...overrides,
});

describe("media keys stay inside the upload directory", () => {
  it("rejects absolute keys and parent segments", () => {
    const root = path.resolve("/data/uploads");
    expect(containedMediaPath(root, "feedback/demo/explore.jpg")).toBe(path.join(root, "feedback/demo/explore.jpg"));
    expect(containedMediaPath(root, "/etc/passwd")).toBeNull();
    expect(containedMediaPath(root, "../etc/passwd")).toBeNull();
    expect(containedMediaPath(root, "uploads/../../etc/passwd")).toBeNull();
  });
});

describe("only approved studios sell", () => {
  it("blocks pending and rejected studios", () => {
    expect(studioCanSell("approved")).toBe(true);
    expect(studioCanSell("pending")).toBe(false);
    expect(studioCanSell("rejected")).toBe(false);
  });
});

describe("draft classes stay private", () => {
  it("shows a class only when it is published by an approved teacher", () => {
    expect(publicListingVisible({ classStatus: "published", teacherStatus: "approved" })).toBe(true);
    expect(publicListingVisible({ classStatus: "draft", teacherStatus: "approved" })).toBe(false);
    expect(publicListingVisible({ classStatus: "published", teacherStatus: "pending" })).toBe(false);
  });
});

describe("form error redirects stay on this site", () => {
  it("drops a protocol-relative back path", () => {
    expect(errorRedirectPath("//evil.example", "That pack is unavailable.")).toBe("/?error=That%20pack%20is%20unavailable.");
    expect(errorRedirectPath("/t/maya/p/five", "Try another code.")).toBe("/t/maya/p/five?error=Try%20another%20code.");
  });
});

describe("class promo preview uses live limits", () => {
  it("rejects a code the student has already redeemed", () => {
    const verdict = classPromoDecision({
      promo: promo(),
      now: new Date("2026-10-08"),
      listPriceCents: 4000,
      totalRedemptions: 0,
      customerRedemptions: 1,
      isFirstTimeStudent: false,
      product: { kind: "class", teacherId: "t1", classId: "c1", categoryId: "cat", city: "Los Angeles" },
    });
    expect(verdict.ok).toBe(false);
  });
});

describe("paid card bookings send confirmation", () => {
  it("emails a booking when checkout completes and skips pack purchases", () => {
    expect(paidCheckoutSendsBookingEmail("booking")).toBe(true);
    expect(paidCheckoutSendsBookingEmail("visit")).toBe(true);
    expect(paidCheckoutSendsBookingEmail("pack")).toBe(false);
  });
});

describe("local uploads are size capped", () => {
  it("rejects a body over 12 MB", () => {
    expect(uploadExceedsLimit(MAX_UPLOAD_BYTES)).toBe(false);
    expect(uploadExceedsLimit(MAX_UPLOAD_BYTES + 1)).toBe(true);
  });
});

describe("teacher invite reset records", () => {
  it("uses the identifier Better Auth looks up for the emailed token", () => {
    expect(passwordResetIdentifier("tok_123")).toBe("reset-password:tok_123");
  });
});
