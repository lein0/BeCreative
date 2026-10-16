import { describe, expect, it } from "vitest";
import { emailCopy } from "@/lib/email-templates";

describe("email subjects", () => {
  it("does not wrap a notification title that already includes the prefix", () => {
    expect(emailCopy("booking.confirmed", { name: "Ada", title: "You're booked: Scene Study" }).subject).toBe("You're booked: Scene Study");
    expect(emailCopy("booking.confirmed", { name: "Ada", title: "Scene Study" }).subject).toBe("You're booked: Scene Study");
    expect(emailCopy("receipt.sent", { name: "Ada", title: "Receipt for Scene Study" }).subject).toBe("Receipt for Scene Study");
    expect(emailCopy("booking.cancelled", { name: "Ada", title: "Cancelled Scene Study" }).subject).toBe("Scene Study was cancelled");
    expect(emailCopy("booking.cancelled", { name: "Ada", title: "Scene Study was cancelled" }).subject).toBe("Scene Study was cancelled");
    expect(emailCopy("teacher.booking", { name: "Maya", title: "New booking: Scene Study" }).subject).toBe("New booking: Scene Study");
  });

  it("names the student who followed, not the teacher who received the note", () => {
    const message = emailCopy("teacher.follow", { name: "Maya", title: "Jules followed your studio" });
    expect(message.subject).toBe("Jules followed your studio");
  });

  it("gives a student a waitlist confirmation instead of the teacher note", () => {
    const message = emailCopy("student.waitlist", { name: "Ada", title: "You're on the waitlist for Scene Study", body: "You do not have a reserved seat yet." });
    expect(message.subject).toBe("You're on the waitlist for Scene Study");
    expect(message.preheader).not.toContain("hoping for a seat");
  });
});
