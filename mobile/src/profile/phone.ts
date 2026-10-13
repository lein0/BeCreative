export function phoneDraftToSave(savedPhone: string, draftPhone: string, smsOptIn: boolean): { phone: string; smsOptIn: boolean } | null {
  const phone = draftPhone.trim();
  if (phone === savedPhone.trim()) return null;
  return { phone, smsOptIn };
}
