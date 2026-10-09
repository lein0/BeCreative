import { describe, expect, it } from "vitest";
import { BECREATIVE, BEWELL, brandForHost } from "@/lib/brand";

describe("brand host mapping", () => {
  it("keeps the creative brand unless the host is a BeWell domain", () => {
    expect(brandForHost("localhost").id).toBe(BECREATIVE.id);
    expect(brandForHost("classes.becreative.com:443").vertical).toBe("creative");
    expect(brandForHost(null).name).toBe("BeCreative");
    expect(brandForHost("bewell.com").id).toBe(BEWELL.id);
    expect(brandForHost("www.bewell.com").vertical).toBe("wellness");
    expect(brandForHost("book.bewell.com").name).toBe("BeWell");
  });
});
