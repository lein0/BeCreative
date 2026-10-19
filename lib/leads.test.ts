import { describe, expect, it } from "vitest";
import { LEAD_CSV_COLUMNS } from "@/lib/constants";
import { leadImportFailure, planLeadImport, rowsFromCsv, toCsv, websiteDomain, type LeadCsvRow } from "@/lib/leads";

const sample: LeadCsvRow = {
  lead_id: "lead-1",
  business_name: "Sunset Scene Lab",
  category: "Acting",
  subcategory: "On-camera",
  business_type: "Studio",
  city: "Los Angeles",
  neighborhood: "Silver Lake",
  street_address: "4121 Sunset Blvd",
  zip: "90029",
  phone: "323-555-0101",
  email: "hello@sunsetscenelab.example",
  website: "https://www.sunsetscenelab.example",
  instagram: "@sunsetscene",
  tiktok: "",
  facebook: "",
  youtube: "",
  linkedin: "",
  other_social: "",
  owner_or_contact_name: "Maya Alvarez",
  contact_role: "Owner",
  google_maps_url: "",
  yelp_url: "",
  rating: "4.8",
  review_count: "120",
  price_hint: "$35 drop-in",
  offers_online: "yes",
  class_formats: "drop-in; series",
  est_size: "12",
  notes: "Teaches nights, has a small black box.",
  source_urls: "https://instagram.com/sunsetscene",
  date_added: "2026-10-01",
  priority: "A",
  outreach_status: "Not contacted",
  last_contacted: "",
  next_step: "Send intro",
  owner_bd_rep: "manager@becreative.demo",
};

describe("lead import", () => {
  it("round-trips the sheet columns and dedupes on id and website domain", () => {
    expect(LEAD_CSV_COLUMNS).toHaveLength(36);
    const csv = toCsv([sample, { ...sample, lead_id: "", business_name: "Echo Park Clay", website: "sunsetscenelab.example/classes", email: "clay@example.com" }]);
    const parsed = rowsFromCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.business_name).toBe("Sunset Scene Lab");
    expect(websiteDomain("https://www.sunsetscenelab.example/path")).toBe("sunsetscenelab.example");
    const plan = planLeadImport([{ id: "lead-1", websiteDomain: "sunsetscenelab.example" }], parsed.rows);
    expect(plan.errors).toEqual([]);
    expect(plan.plans[0]).toMatchObject({ action: "update", id: "lead-1", match: "lead_id" });
    expect(plan.plans[1]).toMatchObject({ action: "update", id: "lead-1", match: "website" });
  });

  it("reports parse and plan errors instead of a successful import", () => {
    expect(leadImportFailure({ errors: ["The file is empty."], imported: 0 })).toBe("The file is empty.");
    expect(leadImportFailure({ errors: ["Row 2: priority must be A, B, or C."], imported: 0 })).toBe("Row 2: priority must be A, B, or C.");
    expect(leadImportFailure({ errors: ["Row 3: business name is required."], imported: 2 })).toBe("Row 3: business name is required. 2 rows were imported before the error.");
    expect(leadImportFailure({ errors: [], imported: 4 })).toBeNull();
    const parsed = rowsFromCsv("not,a,lead,file\n");
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.rows).toHaveLength(0);
    expect(leadImportFailure({ errors: parsed.errors, imported: 0 })).toBe(parsed.errors[0]);
  });
});
