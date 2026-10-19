export function inviteSetPasswordUrl(origin: string, token: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/reset")}`;
}

export function teacherInviteEmail(input: { contactName: string; businessName: string; url: string }) {
  const hello = input.contactName || "Hello";
  const text = `${hello}, ${input.businessName} is invited to list classes on BeCreative. Set your password here: ${input.url}`;
  return {
    subject: "You're invited to teach on BeCreative",
    text,
    html: `<p>${hello}, ${input.businessName} is invited to list classes on BeCreative.</p><p><a href="${input.url}">Set your password</a></p>`,
  };
}

export function inviteActivityNote() {
  return "Sent a link to set a password.";
}
