import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readCloseness, readComparison } from "@/lib/closeness";
import { parseCsv, stableId } from "@/lib/csv";
import { DEV_PACK_FILES } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";
import { runEngineOn } from "@/lib/engine";
import { loadApplicableCodes } from "@/lib/grounds";
import { HELD_OUT_LABEL_FILES, labelsFromRows, PRACTICE_LABEL_FILE, readLabelSets } from "@/lib/run-labels";
import type { Decision, PracticeLabel, Resolution, ResultPayload, ResultRow } from "@/lib/types";
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
  labels: PracticeLabel[];
  heldOutLabels: PracticeLabel[] | null;
};

const SCREENING_KEYS: Record<string, keyof typeof JSONL_FILES | "hits" | "name_variants"> = {
  "hits.jsonl": "hits",
  "customers.jsonl": "customers",
  "accounts.jsonl": "accounts",
  "onboarding.jsonl": "onboarding",
  "kyc_checks.jsonl": "kyc_checks",
  "notes.jsonl": "notes",
  "alerts.jsonl": "alerts",
  "search_results.jsonl": "search_results",
  "name_variants.json": "name_variants",
};

export async function acceptUpload(file: File): Promise<ResultPayload> {
  const filename = displayFileName(file.name);
  const rejected = uploadRejection(file.name, file.size);
  if (rejected) throw new DeskError(rejected, { status: rejected.includes("8 MB") ? 413 : 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new DeskError("That file is larger than 8 MB.", { status: 413 });
  }
  const extension = fileExtensionOf(filename);
  if (extension === "zip" || isZipBuffer(buffer)) {
    return scoreZip(buffer, filename);
  }
  const textExtension = extension;
  if (buffer.includes(0)) {
    throw new DeskError("The file is not plain text CSV or JSON.", { status: 400 });
  }
  const text = buffer.toString("utf8");
  if (textExtension !== "csv" && isScreeningDocument(text, textExtension)) {
    return scoreBundle(bundleFrom(text, textExtension), filename);
  }
  if (looksLikeResults(text, textExtension)) {
    const labels = labelsInText(text, textExtension);
    return recordedPayload(filename, resultsFrom(text, textExtension), labels.labels, labels.heldOutLabels);
  }

  const bundle = bundleFrom(text, textExtension);
  return scoreBundle(bundle, filename);
}

function fileExtensionOf(filename: string): "csv" | "json" | "jsonl" | "zip" {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!isAcceptedExtension(extension)) {
    throw new DeskError("Only .csv, .json, .jsonl, and .zip files can be added.", { status: 415 });
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
    return { hits: csvRecords(text).map(asHit), extras: {}, nameVariants: null, labels: [], heldOutLabels: null };
  }
  const parsed = parseJsonDocument(text, extension);
  if (Array.isArray(parsed)) {
    return { hits: objectsFrom(parsed, "hit").map(asHit), extras: {}, nameVariants: null, labels: [], heldOutLabels: null };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new DeskError("JSON must be an array of hits, JSONL, or an object with a hits list.", {
      status: 400,
    });
  }
  const record = parsed as Record<string, unknown>;
  const labelSets = labelSetsFromRecord(record);
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
      labels: labelSets.labels,
      heldOutLabels: labelSets.heldOutLabels,
    };
  }
  return { hits: [asHit(record, 0)], extras: {}, nameVariants: null, labels: [], heldOutLabels: null };
}

async function scoreBundle(bundle: HitBundle, filename: string): Promise<ResultPayload> {
  const missing = missingBundleFiles(bundle);
  if (missing.length > 0) {
    throw new DeskError(missingUploadMessage(missing), { status: 400 });
  }
  const customerIds = new Set<string>();
  for (const row of bundle.extras.customers ?? []) {
    const id = stringOf(row.record_id);
    if (id) customerIds.add(id);
  }
  const names = new Map<string, string | null>();
  for (const hit of bundle.hits) {
    const id = stringOf(hit.hit_id);
    if (id) names.set(id, stringOf(hit.name));
  }
  const dir = await mkdtemp(path.join(tmpdir(), "screening-upload-"));
  try {
    await writeFile(path.join(dir, "hits.jsonl"), toJsonl(bundle.hits), "utf8");
    for (const [key, fileName] of Object.entries(JSONL_FILES) as [keyof typeof JSONL_FILES, string][]) {
      const provided = bundle.extras[key] ?? [];
      const rows = key === "customers" ? requireCustomerIds(provided) : withIds(provided, key);
      await writeFile(path.join(dir, fileName), toJsonl(rows), "utf8");
    }
    await writeFile(path.join(dir, "name_variants.json"), JSON.stringify(bundle.nameVariants), "utf8");
    return await payloadFromRun(dir, filename, customerIds, names, bundle.labels, bundle.heldOutLabels);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function missingBundleFiles(bundle: HitBundle): string[] {
  const missing: string[] = [];
  for (const fileName of DEV_PACK_FILES) {
    const key = SCREENING_KEYS[fileName];
    if (key === "hits") {
      if (bundle.hits.length === 0) missing.push(fileName);
      continue;
    }
    if (key === "name_variants") {
      if (!bundle.nameVariants) missing.push(fileName);
      continue;
    }
    if (!bundle.extras[key]) missing.push(fileName);
  }
  return missing;
}

function missingUploadMessage(missing: string[]): string {
  return `This upload is missing ${missing.join(", ")}. A hits-only file is not joined to another customer file.`;
}

function recordedPayload(
  filename: string,
  rows: ResultRow[],
  labels: PracticeLabel[],
  heldOutLabels: PracticeLabel[] | null,
): ResultPayload {
  return {
    source: "upload",
    mode: "recorded",
    filename,
    notice: `${filename} already had a decision on every row, so those rows are shown as recorded. Customer ids are not checked against another customer file. They stay in this browser session and are not saved.`,
    rows,
    labels: labels.length > 0 ? labels : undefined,
    heldOutLabels: heldOutLabels ?? undefined,
  };
}

async function payloadFromRun(
  dir: string,
  filename: string,
  customerIds: Set<string>,
  names: Map<string, string | null>,
  labels: PracticeLabel[],
  heldOutLabels: PracticeLabel[] | null,
): Promise<ResultPayload> {
  const [rows, codes] = await Promise.all([runEngineOn(dir, 180_000), loadApplicableCodes(dir, 180_000)]);
  return {
    source: "upload",
    mode: "scored",
    filename,
    notice: `system/run scored ${filename} from the files in that upload. Customer ids come only from that upload. Labels, when the upload includes them, are scored only for this run. These rows stay in this browser session and are not saved.`,
    rows: rows.map((row) => {
      const applicable = codes?.get(row.hit_id);
      const customerId = row.customer_record_id;
      return {
        ...toResultRow(row, names.get(row.hit_id) ?? null),
        groundsChecked: applicable != null,
        applicableCodes: applicable ?? [],
        customerMissing: Boolean(customerId && customerId !== "AMBIGUOUS" && !customerIds.has(customerId)),
      };
    }),
    labels: labels.length > 0 ? labels : undefined,
    heldOutLabels: heldOutLabels ?? undefined,
  };
}

const ZIP_SCRIPT = `
import sys, zipfile
from pathlib import Path
src, dest, allowed_text = sys.argv[1], sys.argv[2], sys.argv[3]
allowed = set(allowed_text.split(","))
limit = 32 * 1024 * 1024
total = 0
chosen = {}
with zipfile.ZipFile(src) as archive:
    for info in archive.infolist():
        if info.is_dir():
            continue
        parts = Path(info.filename).parts
        if not parts or any(part in ("", ".", "..") for part in parts):
            continue
        base = parts[-1]
        if base not in allowed and not base.endswith("labels.jsonl"):
            continue
        previous = chosen.get(base)
        if previous is None or len(parts) < len(Path(previous.filename).parts):
            chosen[base] = info
    root = Path(dest)
    root.mkdir(parents=True, exist_ok=True)
    for base, info in chosen.items():
        total += info.file_size
        if total > limit:
            sys.exit(3)
        target = root / base
        target.write_bytes(archive.read(info))
`;

function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

async function scoreZip(buffer: Buffer, filename: string): Promise<ResultPayload> {
  const dir = await mkdtemp(path.join(tmpdir(), "screening-zip-"));
  try {
    const zipPath = path.join(dir, "upload.zip");
    const dataDir = path.join(dir, "data");
    await mkdir(dataDir);
    await writeFile(zipPath, buffer);
    await extractZip(zipPath, dataDir);
    const missing: string[] = [];
    for (const fileName of DEV_PACK_FILES) {
      try {
        await access(path.join(dataDir, fileName));
      } catch {
        missing.push(fileName);
      }
    }
    if (missing.length > 0) throw new DeskError(missingUploadMessage(missing), { status: 400 });
    const sets = await readLabelSets(dataDir);
    const customerIds = await customerIdsIn(dataDir);
    return await payloadFromRun(dataDir, filename, customerIds, new Map(), sets.labels, sets.heldOutLabels);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function extractZip(zipPath: string, dest: string): Promise<void> {
  const allowed = [...DEV_PACK_FILES, PRACTICE_LABEL_FILE, ...HELD_OUT_LABEL_FILES].join(",");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", ZIP_SCRIPT, zipPath, dest, allowed]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new DeskError("The zip could not be opened.", { status: 400, detail: error.message }));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (code === 3) {
        reject(new DeskError("The unzipped screening files are larger than 32 MB.", { status: 413 }));
        return;
      }
      reject(
        new DeskError("The zip could not be read.", {
          status: 400,
          detail: stderr.trim().slice(0, 500) || `unzip exited with status ${code}.`,
        }),
      );
    });
  });
}

async function customerIdsIn(dir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let text = "";
  try {
    text = await readFile(path.join(dir, "customers.jsonl"), "utf8");
  } catch {
    return ids;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { record_id?: unknown };
      if (typeof row.record_id === "string" && row.record_id.trim()) ids.add(row.record_id.trim());
    } catch {
      continue;
    }
  }
  return ids;
}

function isScreeningDocument(text: string, extension: "json" | "jsonl"): boolean {
  try {
    const parsed = parseJsonDocument(text, extension);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return DEV_PACK_FILES.some((fileName) => {
      const key = SCREENING_KEYS[fileName];
      return key !== "hits" && key in record;
    });
  } catch {
    return false;
  }
}

function labelsInText(
  text: string,
  extension: "csv" | "json" | "jsonl",
): { labels: PracticeLabel[]; heldOutLabels: PracticeLabel[] | null } {
  if (extension === "csv") return { labels: [], heldOutLabels: null };
  try {
    const parsed = parseJsonDocument(text, extension);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { labels: [], heldOutLabels: null };
    return labelSetsFromRecord(parsed as Record<string, unknown>);
  } catch {
    return { labels: [], heldOutLabels: null };
  }
}

function labelSetsFromRecord(record: Record<string, unknown>): {
  labels: PracticeLabel[];
  heldOutLabels: PracticeLabel[] | null;
} {
  const practice = labelsFromRows(record.practice_labels);
  const plain = labelsFromRows(record.labels);
  const heldOut = HELD_OUT_LABEL_FILES.map((name) => labelsFromRows(record[name.replace(/\.jsonl$/, "")])).find(
    (rows) => rows.length > 0,
  );
  if (practice.length > 0 && heldOut && heldOut.length > 0) return { labels: practice, heldOutLabels: heldOut };
  if (practice.length > 0) return { labels: practice, heldOutLabels: null };
  if (plain.length > 0 && heldOut && heldOut.length > 0) return { labels: plain, heldOutLabels: heldOut };
  if (heldOut && heldOut.length > 0) return { labels: heldOut, heldOutLabels: null };
  if (plain.length > 0) return { labels: plain, heldOutLabels: null };
  return { labels: [], heldOutLabels: null };
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
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
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
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
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
