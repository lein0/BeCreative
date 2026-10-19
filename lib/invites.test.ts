import { describe, expect, it } from "vitest";
import { inviteActivityNote, inviteSetPasswordUrl, shouldSendTeacherInvite, teacherInviteEmail } from "@/lib/invites";

describe("teacher invite", () => {
  it("emails a set-password link and never a temporary password", () => {
    const url = inviteSetPasswordUrl("https://classes.example", "tok_123");
    const mail = teacherInviteEmail({ contactName: "Ava", businessName: "Atwater Poems", url });
    expect(url).toBe("https://classes.example/api/auth/reset-password/tok_123?callbackURL=%2Freset");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.text.toLowerCase()).not.toContain("temporary password");
    expect(mail.text).not.toMatch(/Invite-[0-9a-f]/);
    expect(inviteActivityNote().toLowerCase()).not.toContain("temporary password");
    expect(inviteActivityNote()).not.toContain("tok_123");
  });

  it("follows the auth.invite trigger and skips accounts that already have a password", () => {
    expect(shouldSendTeacherInvite({ triggerOn: true, hasPassword: false })).toBe(true);
    expect(shouldSendTeacherInvite({ triggerOn: false, hasPassword: false })).toBe(false);
    expect(shouldSendTeacherInvite({ triggerOn: true, hasPassword: true })).toBe(false);
  });
});
