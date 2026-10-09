/** Confirm a verification token once, including a later token on the same screen. */
export function shouldConfirmVerification(confirmedToken: string | null, token: string): boolean {
  return Boolean(token) && confirmedToken !== token;
}
