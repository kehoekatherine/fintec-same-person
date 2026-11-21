import type { FieldRow } from "@/lib/types";

export type Row = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  record_id: "Record",
  entity_type: "Entity",
  full_name: "Full name",
  preferred_name: "Preferred name",
  login_name: "Login name",
  dob: "Date of birth",
  nationality: "Nationality",
  residence_country: "Residence",
  city: "City",
  address: "Address",
  email: "Email",
  phone: "Phone",
  occupation: "Occupation",
  employer: "Employer",
  registration_number: "Registration",
  onboarded_at: "Onboarded",
  status: "Status",
  last_kyc_refresh: "Last KYC refresh",
  account_id: "Account",
  customer_id: "Customer",
  login_handle: "Login",
  opened_at: "Opened",
  hit_id: "Hit",
  alert_id: "Alert",
  name: "Name",
  aliases: "Aliases",
  dobs: "Dates of birth",
  place_of_birth: "Place of birth",
  countries: "Countries",
  citizenship: "Citizenship",
  addresses: "Addresses",
  categories: "Categories",
  primary_category: "Category",
  position_or_allegation: "Allegation",
  profile_notes: "Profile notes",
  deceased_date: "Date of death",
  screened_at: "Screened",
  account_ref: "Account",
  best_matching_name: "Best matching name",
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  gender: "Gender",
  life_status: "Life status",
  match_score: "Screener name score",
  subcategories: "Subcategories",
  screened_name: "Screened name",
  screened_entity_type: "Screened entity",
  screened_dob: "Screened date of birth",
  screened_country: "Screened country",
  screened_city: "Screened city",
  email_on_alert: "Alert email",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);
const ALWAYS_ON_CUSTOMER = ["full_name", "dob", "residence_country", "nationality", "city"];
const SKIP = new Set([
  "customer",
  "hit_ids",
  "details",
  "sources",
  "source_urls",
  "relationships",
  "identifiers",
]);

export function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fieldsOf(row: Row, customer = false): FieldRow[] {
  const keys = [
    ...FIELD_ORDER.filter((key) => key in row),
    ...Object.keys(row).filter((key) => !FIELD_ORDER.includes(key)),
  ];
  const fields: FieldRow[] = [];
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const text = displayValue(row[key]);
    if (text) {
      fields.push({ label: labelFor(key), value: text });
      continue;
    }
    if (customer && ALWAYS_ON_CUSTOMER.includes(key)) {
      fields.push({ label: labelFor(key), value: "Not on the record" });
    }
  }
  return fields;
}

export function flattenAlert(row: Row): Row {
  const flat: Row = { ...row };
  const customer = row.customer;
  delete flat.customer;
  delete flat.hit_ids;
  if (customer && typeof customer === "object" && !Array.isArray(customer)) {
    const record = customer as Row;
    for (const key of ["name", "entity_type", "dob", "country", "city"] as const) {
      if (key in record) flat[`screened_${key}`] = record[key];
    }
  }
  if ("email" in flat) {
    flat.email_on_alert = flat.email;
    delete flat.email;
  }
  return flat;
}

function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => displayValue(item)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}
