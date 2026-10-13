import { describe, expect, it } from "vitest";
import { phoneDraftToSave } from "./phone";

describe("phone draft", () => {
  it("saves a changed number without requiring the SMS toggle to move", () => {
    expect(phoneDraftToSave("+13105550100", "+13105550199", true)).toEqual({ phone: "+13105550199", smsOptIn: true });
    expect(phoneDraftToSave("", "3105550199", false)).toEqual({ phone: "3105550199", smsOptIn: false });
    expect(phoneDraftToSave("3105550199", "3105550199", true)).toBeNull();
  });
});
