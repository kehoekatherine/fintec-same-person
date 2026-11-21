import { readFile } from "node:fs/promises";
import path from "node:path";

import { findDevPack } from "@/lib/data-pack";
import { stringOf, type Row } from "@/lib/record-fields";

export type NameVariants = {
  groups: string[][];
  legalForms: string[];
};

export type PackIndex = {
  dir: string;
  customers: Map<string, Row>;
  accountsById: Map<string, Row>;
  accountsByCustomer: Map<string, Row[]>;
  hits: Map<string, Row>;
  alerts: Map<string, Row>;
  notes: Map<string, Row>;
  notesByEmail: Map<string, Row[]>;
  checks: Map<string, Row>;
  checksByApplicant: Map<string, Row[]>;
  applicantsByCustomer: Map<string, string[]>;
  searches: Map<string, Row>;
  variants: NameVariants;
};

let loading: Promise<PackIndex | null> | null = null;

export function loadPackIndex(): Promise<PackIndex | null> {
  if (!loading) {
    loading = readIndex().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export function customerPresence(index: PackIndex | null, id: string | null): boolean | null {
  if (!id || id === "AMBIGUOUS") return null;
  if (!index) return null;
  return index.customers.has(id);
}

async function readIndex(): Promise<PackIndex | null> {
  const dir = await findDevPack();
  if (!dir) return null;
  const [customers, accounts, hits, alerts, notes, checks, searches, onboarding, variants] = await Promise.all([
    readRows(path.join(dir, "customers.jsonl")),
    readRows(path.join(dir, "accounts.jsonl")),
    readRows(path.join(dir, "hits.jsonl")),
    readRows(path.join(dir, "alerts.jsonl")),
    readRows(path.join(dir, "notes.jsonl")),
    readRows(path.join(dir, "kyc_checks.jsonl")),
    readRows(path.join(dir, "search_results.jsonl")),
    readRows(path.join(dir, "onboarding.jsonl")),
    readVariants(path.join(dir, "name_variants.json")),
  ]);
  const customerMap = new Map<string, Row>();
  for (const row of customers) {
    const id = stringOf(row.record_id);
    if (id && !customerMap.has(id)) customerMap.set(id, row);
  }
  const accountsById = new Map<string, Row>();
  const accountsByCustomer = new Map<string, Row[]>();
  for (const row of accounts) {
    const id = stringOf(row.account_id);
    if (id && !accountsById.has(id)) accountsById.set(id, row);
    const customerId = stringOf(row.customer_id);
    if (!customerId) continue;
    const list = accountsByCustomer.get(customerId);
    if (list) list.push(row);
    else accountsByCustomer.set(customerId, [row]);
  }
  const hitMap = new Map<string, Row>();
  for (const row of hits) {
    const id = stringOf(row.hit_id);
    if (id && !hitMap.has(id)) hitMap.set(id, row);
  }
  const alertMap = new Map<string, Row>();
  for (const row of alerts) {
    const id = stringOf(row.alert_id);
    if (id && !alertMap.has(id)) alertMap.set(id, row);
  }
  const noteMap = indexBy(notes, "note_id");
  const notesByEmail = new Map<string, Row[]>();
  for (const row of notes) {
    const email = stringOf(row.requester_email)?.toLowerCase();
    if (!email) continue;
    const list = notesByEmail.get(email);
    if (list) list.push(row);
    else notesByEmail.set(email, [row]);
  }
  const checkMap = indexBy(checks, "check_id");
  const checksByApplicant = new Map<string, Row[]>();
  for (const row of checks) {
    const applicant = stringOf(row.applicant_id);
    if (!applicant) continue;
    const list = checksByApplicant.get(applicant);
    if (list) list.push(row);
    else checksByApplicant.set(applicant, [row]);
  }
  const applicantsByCustomer = new Map<string, string[]>();
  for (const row of onboarding) {
    const customerId = stringOf(row.customer_id);
    const applicant = stringOf(row.kyc_applicant_id);
    if (!customerId || !applicant) continue;
    const list = applicantsByCustomer.get(customerId);
    if (list) {
      if (!list.includes(applicant)) list.push(applicant);
    } else applicantsByCustomer.set(customerId, [applicant]);
  }
  return {
    dir,
    customers: customerMap,
    accountsById,
    accountsByCustomer,
    hits: hitMap,
    alerts: alertMap,
    notes: noteMap,
    notesByEmail,
    checks: checkMap,
    checksByApplicant,
    applicantsByCustomer,
    searches: indexBy(searches, "result_id"),
    variants,
  };
}

async function readVariants(file: string): Promise<NameVariants> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { groups?: unknown; company_legal_forms?: unknown };
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .filter((group): group is unknown[] => Array.isArray(group))
          .map((group) => group.filter((name): name is string => typeof name === "string" && Boolean(name.trim())))
          .filter((group) => group.length > 0)
      : [];
    const legalForms = Array.isArray(parsed.company_legal_forms)
      ? parsed.company_legal_forms.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
      : [];
    return { groups, legalForms };
  } catch {
    return { groups: [], legalForms: [] };
  }
}

function indexBy(rows: Row[], key: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = stringOf(row[key]);
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

async function readRows(file: string): Promise<Row[]> {
  const text = await readFile(file, "utf8");
  const rows: Row[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Row);
  }
  return rows;
}
