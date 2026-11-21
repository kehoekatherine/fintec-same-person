import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { DeskError } from "@/lib/errors";
import { runEngineOn } from "@/lib/engine";
import { loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { parseResolutions } from "@/lib/resolutions";
import type {
  DeskCase,
  DeskPayload,
  EvidenceRecord,
  FieldRow,
  Resolution,
  ScreenedCustomer,
  WatchlistHit,
} from "@/lib/types";

export { DeskError } from "@/lib/errors";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "brief");

const FILES = [
  "customers.jsonl",
  "accounts.jsonl",
  "onboarding.jsonl",
  "kyc_checks.jsonl",
  "notes.jsonl",
  "alerts.jsonl",
  "hits.jsonl",
  "search_results.jsonl",
] as const;

const INDEX: { file: string; kind: string; idKey: string }[] = [
  { file: "customers.jsonl", kind: "Customer record", idKey: "record_id" },
  { file: "accounts.jsonl", kind: "Account", idKey: "account_id" },
  { file: "alerts.jsonl", kind: "Alert", idKey: "alert_id" },
  { file: "hits.jsonl", kind: "Watchlist hit", idKey: "hit_id" },
  { file: "notes.jsonl", kind: "Note", idKey: "note_id" },
  { file: "kyc_checks.jsonl", kind: "Identity check", idKey: "check_id" },
  { file: "search_results.jsonl", kind: "Search result", idKey: "result_id" },
  { file: "onboarding.jsonl", kind: "Onboarding link", idKey: "kyc_applicant_id" },
];

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
  text: "Text",
  note_id: "Note",
  check_id: "Check",
  verified_name: "Verified name",
  verified_dob: "Verified date of birth",
  document_type: "Document",
  document_number: "Document number",
  document_country: "Document country",
  result: "Result",
  checked_at: "Checked",
  title: "Title",
  snippet: "Snippet",
  query: "Query",
  result_id: "Result",
  source: "Source",
  requester_email: "Requester",
  created_at: "Created",
  channel: "Channel",
  kyc_applicant_id: "Applicant",
  gender: "Gender",
  life_status: "Life status",
  match_score: "Screener name score",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

const ALWAYS_ON_CUSTOMER = ["full_name", "dob", "residence_country", "nationality", "city"];

type Row = Record<string, unknown>;

export async function loadDesk(options: { allowSnapshot: boolean }): Promise<DeskPayload> {
  await assertFixtureStaysInApp();
  const [world, pack] = await Promise.all([readWorld(), loadPackIndex().catch(() => null)]);
  try {
    const rows = await runEngine();
    return assemble(world, rows, pack, {
      source: "engine",
      notice:
        "Fictional brief. These four cases were just written by system/run on the brief fixture. They are not the development run, and their customer ids are not rows in the development customers.jsonl.",
    });
  } catch (error) {
    if (error instanceof DeskError && error.code === "missing" && options.allowSnapshot) {
      const rows = await readSnapshot();
      return assemble(world, rows, pack, {
        source: "snapshot",
        notice:
          "Fictional brief. These four recorded cases are not the development run. Their customer ids are not rows in the development customers.jsonl.",
      });
    }
    throw error;
  }
}

async function assertFixtureStaysInApp(): Promise<void> {
  const [root, fixture] = await Promise.all([realpath(process.cwd()), realpath(FIXTURE_DIR)]);
  if (fixture.includes("hackathon-data") || !fixture.startsWith(`${root}${path.sep}`)) {
    throw new DeskError("The desk only reads the fictional brief fixture inside this app.", {
      status: 500,
    });
  }
}

async function runEngine(): Promise<Resolution[]> {
  return runEngineOn(FIXTURE_DIR, 20_000, {
    missingMessage:
      "The Python resolver is not available in this deployment, so the fixture cannot be re-run.",
  });
}

async function readSnapshot(): Promise<Resolution[]> {
  try {
    const text = await readFile(path.join(FIXTURE_DIR, "resolved.jsonl"), "utf8");
    return parseResolutions(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing recorded output.";
    throw new DeskError("The Python resolver is unavailable and there is no recorded run to show.", {
      status: 500,
      detail: message,
    });
  }
}

async function readWorld(): Promise<Map<string, Row[]>> {
  const world = new Map<string, Row[]>();
  for (const file of FILES) {
    const text = await readFile(path.join(FIXTURE_DIR, file), "utf8");
    const rows: Row[] = [];
    for (const line of text.split("\n")) {
      if (line.trim()) rows.push(JSON.parse(line) as Row);
    }
    world.set(file, rows);
  }
  return world;
}

function assemble(
  world: Map<string, Row[]>,
  resolutions: Resolution[],
  pack: PackIndex | null,
  meta: { source: DeskPayload["source"]; notice: string },
): DeskPayload {
  const alerts = new Map<string, Row>();
  for (const row of world.get("alerts.jsonl") ?? []) {
    const id = stringOf(row.alert_id);
    if (id) alerts.set(id, row);
  }
  const hits = new Map<string, Row>();
  for (const row of world.get("hits.jsonl") ?? []) {
    const id = stringOf(row.hit_id);
    if (id) hits.set(id, row);
  }
  const indexed = indexRecords(world);
  const cases: DeskCase[] = resolutions.map((resolution) => {
    const hit = hits.get(resolution.hit_id);
    const alert = alerts.get(resolution.alert_id);
    return {
      hitId: resolution.hit_id,
      alertId: resolution.alert_id,
      screened: screenedFrom(alert),
      hit: hitFrom(hit),
      resolution,
      evidence: resolution.evidence.map((id) => evidenceFrom(id, indexed.get(id), pack)),
      customerNote: briefCustomerNote(resolution.customer_record_id, pack),
    };
  });
  return {
    source: meta.source,
    notice: meta.notice,
    ranAt: new Date().toISOString(),
    cases,
  };
}

function indexRecords(world: Map<string, Row[]>): Map<string, { kind: string; file: string; row: Row }> {
  const indexed = new Map<string, { kind: string; file: string; row: Row }>();
  for (const spec of INDEX) {
    for (const row of world.get(spec.file) ?? []) {
      const id = stringOf(row[spec.idKey]);
      if (id && !indexed.has(id)) indexed.set(id, { kind: spec.kind, file: spec.file, row });
    }
  }
  return indexed;
}

function screenedFrom(alert: Row | undefined): ScreenedCustomer {
  const customer = (alert?.customer ?? {}) as Row;
  return {
    name: stringOf(customer.name) ?? "Unknown screened name",
    entityType: stringOf(customer.entity_type),
    dob: stringOf(customer.dob),
    country: stringOf(customer.country),
    city: stringOf(customer.city),
    screenedAt: stringOf(alert?.screened_at),
    accountRef: stringOf(alert?.account_ref),
  };
}

function hitFrom(hit: Row | undefined): WatchlistHit {
  return {
    name: stringOf(hit?.name) ?? "Unknown listed name",
    aliases: stringList(hit?.aliases),
    entityType: stringOf(hit?.entity_type),
    dobs: stringList(hit?.dobs),
    placeOfBirth: stringOf(hit?.place_of_birth),
    countries: stringList(hit?.countries),
    nationality: stringList(hit?.nationality),
    category: stringOf(hit?.primary_category) ?? stringList(hit?.categories)[0] ?? null,
    allegation: stringOf(hit?.position_or_allegation),
    notes: stringOf(hit?.profile_notes),
    matchScore: typeof hit?.match_score === "number" ? hit.match_score : null,
  };
}

function evidenceFrom(
  id: string,
  found: { kind: string; file: string; row: Row } | undefined,
  pack: PackIndex | null,
): EvidenceRecord {
  if (!found) {
    return {
      id,
      kind: "Missing record",
      file: "not in the fictional brief",
      note: null,
      fields: [{ label: "Id", value: `${id} is cited, but the fictional brief has no record with that id.` }],
    };
  }
  const customer = found.kind === "Customer record";
  return {
    id,
    kind: customer ? "Fictional customer" : found.kind,
    file: `fictional brief / ${found.file}`,
    note: customer ? briefCustomerNote(id, pack) : null,
    fields: fieldsOf(found.row, customer),
  };
}

function briefCustomerNote(id: string | null, pack: PackIndex | null): string {
  const fictional = "Fictional brief record.";
  if (!id || id === "AMBIGUOUS") {
    return `${fictional} This case is not part of the development run.`;
  }
  if (pack && !pack.customers.has(id)) {
    return `${id} is not in customers.jsonl. ${fictional} It is not a development customer.`;
  }
  if (pack) {
    return `${fictional} The fields on this case are from the brief fixture, not the development customers.jsonl.`;
  }
  return `${fictional} The development customers.jsonl is not on this machine, so this id is not opened as a development customer.`;
}

function fieldsOf(row: Row, customer: boolean): FieldRow[] {
  const keys = [
    ...FIELD_ORDER.filter((key) => key in row),
    ...Object.keys(row).filter((key) => !FIELD_ORDER.includes(key)),
  ];
  const fields: FieldRow[] = [];
  for (const key of keys) {
    if (key === "customer" || key === "hit_ids" || key === "details" || key === "sources") continue;
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

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
