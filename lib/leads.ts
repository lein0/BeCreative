import { LEAD_CSV_COLUMNS, outreachFromLabel, type OutreachStatus, type Priority } from "@/lib/constants";

export type LeadCsvRow = {
  lead_id: string;
  business_name: string;
  category: string;
  subcategory: string;
  business_type: string;
  city: string;
  neighborhood: string;
  street_address: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  youtube: string;
  linkedin: string;
  other_social: string;
  owner_or_contact_name: string;
  contact_role: string;
  google_maps_url: string;
  yelp_url: string;
  rating: string;
  review_count: string;
  price_hint: string;
  offers_online: string;
  class_formats: string;
  est_size: string;
  notes: string;
  source_urls: string;
  date_added: string;
  priority: string;
  outreach_status: string;
  last_contacted: string;
  next_step: string;
  owner_bd_rep: string;
};

export function websiteDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function toCsv(rows: LeadCsvRow[]): string {
  const lines = [LEAD_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(LEAD_CSV_COLUMNS.map((column) => escapeCell(row[column] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowsFromCsv(text: string): { rows: LeadCsvRow[]; errors: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: ["The file is empty."] };
  const header = table[0].map((cell) => cell.trim());
  const missing = LEAD_CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  const index = new Map(header.map((name, position) => [name, position]));
  const rows: LeadCsvRow[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((cells, rowIndex) => {
    const record = {} as LeadCsvRow;
    for (const column of LEAD_CSV_COLUMNS) record[column] = cells[index.get(column) ?? -1]?.trim() ?? "";
    if (!record.business_name) {
      errors.push(`Row ${rowIndex + 2}: business name is required.`);
      return;
    }
    rows.push(record);
  });
  return { rows, errors };
}

export type ExistingLead = { id: string; websiteDomain: string | null };

export type ImportPlan = {
  action: "insert" | "update";
  id: string;
  match: "lead_id" | "website" | "new";
  row: LeadCsvRow;
  warnings: string[];
};

export function planLeadImport(existing: ExistingLead[], rows: LeadCsvRow[]): { plans: ImportPlan[]; errors: string[] } {
  const byId = new Map(existing.map((lead) => [lead.id, lead]));
  const byDomain = new Map(existing.filter((lead) => lead.websiteDomain).map((lead) => [lead.websiteDomain as string, lead.id]));
  const plans: ImportPlan[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const warnings: string[] = [];
    const domain = websiteDomain(row.website);
    if (row.priority && !["A", "B", "C"].includes(row.priority.toUpperCase())) {
      errors.push(`Row ${index + 2}: priority must be A, B, or C.`);
      return;
    }
    if (row.outreach_status && !outreachFromLabel(row.outreach_status)) {
      errors.push(`Row ${index + 2}: unknown outreach status "${row.outreach_status}".`);
      return;
    }
    let matchId = row.lead_id && byId.has(row.lead_id) ? row.lead_id : "";
    let match: ImportPlan["match"] = matchId ? "lead_id" : "new";
    if (!matchId && domain && byDomain.has(domain)) {
      matchId = byDomain.get(domain) ?? "";
      match = "website";
    }
    const id = matchId || row.lead_id || crypto.randomUUID();
    if (domain) {
      const owner = byDomain.get(domain);
      if (owner && owner !== id) warnings.push(`Website ${domain} was already used by another lead.`);
      byDomain.set(domain, id);
    }
    byId.set(id, { id, websiteDomain: domain });
    plans.push({ action: match === "new" && !row.lead_id ? "insert" : match === "new" ? "insert" : "update", id, match: match === "new" && row.lead_id ? "new" : match, row, warnings });
  });
  return { plans, errors };
}

export function priorityOf(value: string): Priority {
  const upper = value.toUpperCase();
  return upper === "A" || upper === "B" || upper === "C" ? upper : "B";
}

export function statusOf(value: string): OutreachStatus {
  return outreachFromLabel(value) ?? "not_contacted";
}

export function offersOnlineOf(value: string): boolean {
  return ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
}
