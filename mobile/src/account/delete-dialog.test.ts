import { describe, expect, it } from "vitest";
import { accountDeleteDialog, accountDeleteStart } from "./delete-dialog";

describe("account delete dialog", () => {
  it("stays open and ignores a second confirm while deletion is running", () => {
    expect(accountDeleteDialog(false)).toEqual({ dismissible: true, confirmDisabled: false });
    expect(accountDeleteDialog(true)).toEqual({ dismissible: false, confirmDisabled: true });
    expect(accountDeleteStart(false)).toBe("start");
    expect(accountDeleteStart(true)).toBe("ignore");
  });
});
