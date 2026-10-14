/** While deletion is running the sheet stays up and a second confirm is ignored. */
export function accountDeleteDialog(busy: boolean) {
  return { dismissible: !busy, confirmDisabled: busy };
}

export function accountDeleteStart(running: boolean) {
  return running ? "ignore" as const : "start" as const;
}
