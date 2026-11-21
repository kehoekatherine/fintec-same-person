import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readCloseness, readComparison } from "@/lib/closeness";
import { parseCsv, stableId } from "@/lib/csv";
import { findDevPack } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";
import { runEngineOn } from "@/lib/engine";
import { customerPresence, loadPackIndex } from "@/lib/pack-index";
import type { Decision, Resolution, ResultPayload, ResultRow } from "@/lib/types";
import { displayFileName, isAcceptedExtension, MAX_UPLOAD_BYTES, uploadRejection } from "@/lib/upload-file";

const JSONL_FILES = {
  alerts: "alerts.jsonl",
  customers: "customers.jsonl",
  accounts: "accounts.jsonl",
  onboarding: "onboarding.jsonl",
  kyc_checks: "kyc_checks.jsonl",
  notes: "notes.jsonl",
  search_results: "search_results.jsonl",
} as const;

const REQUIRED_IDS: Partial<Record<keyof typeof JSONL_FILES, string>> = {
  alerts: "alert_id",
  customers: "record_id",
  accounts: "account_id",
  search_results: "result_id",
};

const KNOWN_HEADERS = new Set([
  "hit_id",
  "alert_id",
  "name",
  "entity_type",
  "dob",
  "dobs",
  "country",
  "countries",
  "city",
  "aliases",
  "decision",
  "reason_code",
  "reason",
  "customer_record_id",
  "evidence",
  "profile_notes",
  "place_of_birth",
  "primary_category",
  "nationality",
  "citizenship",
  "addresses",
]);

const DECISION_WORDS: Record<string, Decision> = {
  different_entity: "DIFFERENT_ENTITY",
  same_entity: "SAME_ENTITY",
  review: "REVIEW",
  clear: "DIFFERENT_ENTITY",
  confirm: "SAME_ENTITY",
};

type HitBundle = {
  hits: Record<string, unknown>[];
  extras: Partial<Record<keyof typeof JSONL_FILES, Record<string, unknown>[]>>;
  nameVariants: Record<string, unknown> | null;
};

export async function acceptUpload(file: File): Promise<ResultPayload> {
  const filename = displayFileName(file.name);
  const rejected = uploadRejection(file.name, file.size);
  if (rejected) throw new DeskError(rejected, { status: rejected.includes("8 MB") ? 413 : 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new DeskError("That file is larger than 8 MB.", { status: 413 });
  }
  if (buffer.includes(0)) {
    throw new DeskError("The file is not plain text CSV or JSON.", { status: 400 });
  }
  const text = buffer.toString("utf8");
  const extension = fileExtensionOf(filename);
  const names = new Map<string, string | null>();

  if (looksLikeResults(text, extension)) {
    const rows = await markCustomers(resultsFrom(text, extension));
    return {
      source: "upload",
      mode: "recorded",
      filename,
      notice: `${filename} already had a decision on every row, so those rows are shown as recorded. Customer ids are checked against the development customers.jsonl and are not invented. They stay in this browser session and are not saved.`,
      rows,
    };
  }

  const bundle = bundleFrom(text, extension);
  for (const hit of bundle.hits) {
    const id = stringOf(hit.hit_id);
    if (id) names.set(id, stringOf(hit.name));
  }
  const scored = await scoreBundle(bundle);
  return {
    source: "upload",
    mode: "scored",
    filename,
    notice: scored.joinedDev
      ? `system/run scored ${filename} against the development customers.jsonl. Customer ids come only from that file. These rows stay in this browser session and are not saved.`
      : `system/run scored ${filename} with the customers in that file. Customer ids are not invented. These rows stay in this browser session and are not saved.`,
    rows: await markCustomers(scored.rows.map((row) => toResultRow(row, names.get(row.hit_id) ?? null))),
  };
}

function fileExtensionOf(filename: string): "csv" | "json" | "jsonl" {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!isAcceptedExtension(extension)) {
    throw new DeskError("Only .csv, .json, and .jsonl files can be added.", { status: 415 });
  }
  return extension;
}

function looksLikeResults(text: string, extension: "csv" | "json" | "jsonl"): boolean {
  const records = extension === "csv" ? csvRecords(text) : jsonRecords(text, extension);
  if (records.length === 0) return false;
  const marked = records.filter((row) => decisionValue(row) != null).length;
  if (marked === 0) return false;
  if (marked === records.length) return true;
  throw new DeskError(
    "Either every row has a decision, or none do. A mix cannot be scored and displayed together.",
    { status: 400 },
  );
}

function resultsFrom(text: string, extension: "csv" | "json" | "jsonl"): ResultRow[] {
  const records = extension === "csv" ? csvRecords(text) : jsonRecords(text, extension);
  if (records.length === 0) throw new DeskError("The file has no rows to show.", { status: 400 });
  return records.map((row, index) => asResult(row, index));
}

function bundleFrom(text: string, extension: "csv" | "json" | "jsonl"): HitBundle {
  if (extension === "csv") {
    return { hits: csvRecords(text).map(asHit), extras: {}, nameVariants: null };
  }
  const parsed = parseJsonDocument(text, extension);
  if (Array.isArray(parsed)) {
    return { hits: objectsFrom(parsed, "hit").map(asHit), extras: {}, nameVariants: null };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new DeskError("JSON must be an array of hits, JSONL, or an object with a hits list.", {
      status: 400,
    });
  }
  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.hits) || "hits" in record) {
    if (!Array.isArray(record.hits)) {
      throw new DeskError("hits must be a list of records.", { status: 400 });
    }
    const extras: HitBundle["extras"] = {};
    for (const key of Object.keys(JSONL_FILES) as (keyof typeof JSONL_FILES)[]) {
      if (!(key in record)) continue;
      if (!Array.isArray(record[key])) {
        throw new DeskError(`${key} must be a list of records.`, { status: 400 });
      }
      extras[key] = withIds(objectsFrom(record[key] as unknown[], key), key);
    }
    return {
      hits: objectsFrom(record.hits, "hit").map(asHit),
      extras,
      nameVariants: nameVariantsFrom(record.name_variants),
    };
  }
  return { hits: [asHit(record, 0)], extras: {}, nameVariants: null };
}

async function scoreBundle(bundle: HitBundle): Promise<{ rows: Resolution[]; joinedDev: boolean }> {
  if (bundle.hits.length === 0) {
    throw new DeskError("The file has no hits to score.", { status: 400 });
  }
  const hitsOnly = (bundle.extras.customers?.length ?? 0) === 0;
  const pack = hitsOnly ? await findDevPack() : null;
  if (hitsOnly && !pack) {
    throw new DeskError(
      "A hits-only file is scored against the development customers.jsonl, and that file is not on this machine.",
      { status: 404 },
    );
  }
  const dir = await mkdtemp(path.join(tmpdir(), "screening-upload-"));
  try {
    await writeFile(path.join(dir, "hits.jsonl"), toJsonl(bundle.hits), "utf8");
    for (const [key, filename] of Object.entries(JSONL_FILES) as [keyof typeof JSONL_FILES, string][]) {
      const provided = bundle.extras[key];
      const dest = path.join(dir, filename);
      if (provided && provided.length > 0) {
        const rows = key === "customers" ? requireCustomerIds(provided) : withIds(provided, key);
        await writeFile(dest, toJsonl(rows), "utf8");
        continue;
      }
      if (hitsOnly && pack) {
        await symlink(path.join(pack, filename), dest);
        continue;
      }
      await writeFile(dest, "", "utf8");
    }
    const variantsPath = path.join(dir, "name_variants.json");
    if (bundle.nameVariants) {
      await writeFile(variantsPath, JSON.stringify(bundle.nameVariants), "utf8");
    } else if (hitsOnly && pack) {
      await symlink(path.join(pack, "name_variants.json"), variantsPath);
    } else {
      await copyFile(await briefVariantsPath(), variantsPath);
    }
    return { rows: await runEngineOn(dir, 180_000), joinedDev: Boolean(hitsOnly && pack) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function markCustomers(rows: ResultRow[]): Promise<ResultRow[]> {
  const index = await loadPackIndex().catch(() => null);
  return rows.map((row) => ({ ...row, customerInFile: customerPresence(index, row.customerRecordId) }));
}

function requireCustomerIds(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row, index) => {
    if (stringOf(row.record_id)) return row;
    throw new DeskError("A customer row has no record_id. The desk does not invent customer ids.", {
      status: 400,
      detail: `Customer row ${index + 1} has no record_id.`,
    });
  });
}

async function briefVariantsPath(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "fixtures", "brief", "name_variants.json"),
    path.resolve(process.cwd(), "web", "fixtures", "brief", "name_variants.json"),
  ];
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new DeskError("The resolver's name list is not available, so the file cannot be scored.", {
    status: 500,
  });
}

function csvRecords(text: string): Record<string, unknown>[] {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CSV could not be read.";
    throw new DeskError(message, { status: 400 });
  }
  if (table.length === 0) throw new DeskError("The CSV is empty.", { status: 400 });
  const headers = table[0].map(normalizeHeader);
  if (!headers.some((header) => KNOWN_HEADERS.has(header))) {
    throw new DeskError(
      "The CSV needs a header row. Expected columns include hit_id, alert_id, name, entity_type, dob, country, city, and aliases.",
      { status: 400 },
    );
  }
  const body = table.slice(1);
  if (body.length === 0) throw new DeskError("The CSV has a header but no rows.", { status: 400 });
  return body.map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

function jsonRecords(text: string, extension: "json" | "jsonl"): Record<string, unknown>[] {
  const parsed = parseJsonDocument(text, extension);
  if (Array.isArray(parsed)) return objectsFrom(parsed, "hit");
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.hits)) return objectsFrom(record.hits, "hit");
    return [record];
  }
  throw new DeskError("JSON must be an array of hits, JSONL, or an object with a hits list.", {
    status: 400,
  });
}

function parseJsonDocument(text: string, extension: "json" | "jsonl"): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new DeskError("The file is empty.", { status: 400 });
  if (extension === "jsonl" || (extension === "json" && looksLikeJsonl(trimmed))) {
    return parseJsonl(trimmed);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    if (trimmed.includes("\n")) return parseJsonl(trimmed);
    throw new DeskError("This JSON file could not be read.", { status: 400 });
  }
}

function looksLikeJsonl(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim());
  return lines.length > 1 && lines.every((line) => line.trim().startsWith("{"));
}

function parseJsonl(text: string): unknown[] {
  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as unknown);
    } catch {
      throw new DeskError("A line in the JSONL file is not valid JSON.", {
        status: 400,
        detail: line.trim().slice(0, 200),
      });
    }
  }
  if (rows.length === 0) throw new DeskError("The file has no rows.", { status: 400 });
  return rows;
}

function objectsFrom(values: unknown[], label: string): Record<string, unknown>[] {
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DeskError(`Each ${label} must be a JSON object.`, {
        status: 400,
        detail: `Item ${index + 1} is not an object.`,
      });
    }
    return value as Record<string, unknown>;
  });
}

function withIds(rows: Record<string, unknown>[], key: keyof typeof JSONL_FILES): Record<string, unknown>[] {
  if (key === "customers") return requireCustomerIds(rows);
  const idKey = REQUIRED_IDS[key];
  if (!idKey) return rows;
  return rows.map((row, index) => {
    if (stringOf(row[idKey])) return row;
    return { ...row, [idKey]: stableId(idKey.slice(0, 3).toUpperCase(), `${key}|${index}|${JSON.stringify(row)}`) };
  });
}

function asHit(row: Record<string, unknown>, index: number): Record<string, unknown> {
  const hit: Record<string, unknown> = { ...row };
  const name = stringOf(hit.name) ?? "";
  const dob = stringOf(hit.dob) ?? "";
  const country = stringOf(hit.country) ?? "";
  const city = stringOf(hit.city) ?? "";
  const entity = stringOf(hit.entity_type) ?? "";
  if (!stringOf(hit.hit_id)) {
    hit.hit_id = stableId("H", [String(index), name, dob, country, city, entity].join("|"));
  }
  if (!stringOf(hit.alert_id)) {
    hit.alert_id = stableId("A", `${index}|${String(hit.hit_id)}`);
  }
  hit.dobs = stringList(hit.dobs, dob);
  hit.aliases = stringList(hit.aliases, stringOf(hit.aliases));
  hit.countries = stringList(hit.countries, country);
  if (!Array.isArray(hit.addresses) && city) {
    hit.addresses = [country ? `${city}, ${country}` : city];
  }
  if (!Array.isArray(hit.nationality)) hit.nationality = stringList(hit.nationality, null);
  if (!Array.isArray(hit.citizenship)) hit.citizenship = stringList(hit.citizenship, null);
  return hit;
}

function asResult(row: Record<string, unknown>, index: number): ResultRow {
  const decision = canonicalDecision(decisionValue(row));
  if (!decision) {
    throw new DeskError(
      "Every row needs a decision of DIFFERENT_ENTITY, SAME_ENTITY, or REVIEW. Leave the decision column out to score the file instead.",
      { status: 400 },
    );
  }
  const name = stringOf(row.name);
  const reason = stringOf(row.reason) ?? "";
  const comparison = readComparison(row.comparison);
  return {
    hitId: stringOf(row.hit_id) ?? stableId("H", `${index}|${name ?? ""}|${decision}|${reason}`),
    alertId: stringOf(row.alert_id) ?? "",
    decision,
    reasonCode: stringOf(row.reason_code) ?? "",
    customerRecordId: stringOf(row.customer_record_id),
    customerInFile: null,
    reason,
    evidence: evidenceOf(row.evidence),
    comparison,
    closeness: readCloseness(row.closeness, comparison, decision),
    name,
    listedName: stringOf(row.listed_name),
    customerDob: stringOf(row.customer_dob) ?? stringOf(row.dob),
    customerCountry: stringOf(row.customer_country) ?? stringOf(row.country),
  };
}

export function toResultRow(row: Resolution, name: string | null = null): ResultRow {
  return {
    hitId: row.hit_id,
    alertId: row.alert_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    customerRecordId: row.customer_record_id,
    customerInFile: null,
    reason: row.reason,
    evidence: row.evidence,
    comparison: row.comparison,
    closeness: row.closeness,
    name,
    listedName: null,
    customerDob: null,
    customerCountry: null,
  };
}

function nameVariantsFrom(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeskError("name_variants must be an object with groups and company_legal_forms.", {
      status: 400,
    });
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.groups) || !Array.isArray(record.company_legal_forms)) {
    throw new DeskError("name_variants must include groups and company_legal_forms.", { status: 400 });
  }
  return record;
}

function decisionValue(row: Record<string, unknown>): string | null {
  const value = row.decision;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function canonicalDecision(value: string | null): Decision | null {
  if (!value) return null;
  return DECISION_WORDS[value.trim().toLowerCase()] ?? null;
}

function evidenceOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringOf(item)).filter((item): item is string => Boolean(item));
  }
  const text = stringOf(value);
  if (!text) return [];
  return splitList(text);
}

function stringList(value: unknown, fallback: string | null): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringOf(item)).filter((item): item is string => Boolean(item));
  }
  const text = stringOf(value) ?? fallback;
  if (!text) return [];
  return splitList(text);
}

function splitList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => stringOf(item)).filter((item): item is string => Boolean(item));
      }
    } catch {
      // A bracketed cell that is not JSON is one value.
    }
  }
  if (trimmed.includes("|")) return trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  if (trimmed.includes(";")) return trimmed.split(";").map((part) => part.trim()).filter(Boolean);
  return [trimmed];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function stringOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function toJsonl(rows: unknown[]): string {
  if (rows.length === 0) return "";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}
