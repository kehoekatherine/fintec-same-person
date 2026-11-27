import { readCloseness, readComparison } from "@/lib/closeness";
import { parseCsv } from "@/lib/csv-text";
import { DeskError } from "@/lib/errors";
import { displayFileName, fileExtension, uploadRejection } from "@/lib/upload-file";
import type { Decision, ResultPayload, ResultRow } from "@/lib/types";

const DECISION_WORDS: Record<string, Decision> = {
  different_entity: "DIFFERENT_ENTITY",
  same_entity: "SAME_ENTITY",
  review: "REVIEW",
  clear: "DIFFERENT_ENTITY",
  confirm: "SAME_ENTITY",
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

export const STATIC_RESOLVER_LIMIT =
  "The public desk cannot run the Python resolver. Choose a .csv, .json, or .jsonl file that already has a decision on every row. Scoring a zip or a source folder needs the local desk.";

/** Show a file that already carries a decision. Does not score source rows and does not open a zip. */
export async function readRecordedUpload(file: File): Promise<ResultPayload> {
  const filename = displayFileName(file.name);
  const rejected = uploadRejection(file.name, file.size);
  if (rejected) throw new DeskError(rejected, { status: rejected.includes("8 MB") ? 413 : 415 });
  const extension = fileExtension(filename);
  if (extension === "zip") throw new DeskError(STATIC_RESOLVER_LIMIT, { status: 400 });
  if (extension !== "csv" && extension !== "json" && extension !== "jsonl") {
    throw new DeskError("Only .csv, .json, .jsonl, and .zip files can be added.", { status: 415 });
  }
  const text = await file.text();
  if (text.includes("\0")) throw new DeskError("The file is not plain text CSV or JSON.", { status: 400 });
  const records = extension === "csv" ? csvRecords(text) : jsonRecords(text, extension);
  const marked = records.filter((row) => decisionValue(row) != null).length;
  if (marked === 0) throw new DeskError(STATIC_RESOLVER_LIMIT, { status: 400 });
  if (marked !== records.length) {
    throw new DeskError(
      "Either every row has a decision, or none do. A mix cannot be scored and displayed together.",
      { status: 400 },
    );
  }
  return {
    source: "upload",
    mode: "recorded",
    filename,
    notice: `${filename} already had a decision on every row, so those rows are shown as recorded. The public desk does not run the resolver, and this file stays in the browser.`,
    rows: records.map((row, index) => asResult(row, index)),
  };
}

function asResult(row: Record<string, unknown>, index: number): ResultRow {
  const decision = canonicalDecision(decisionValue(row));
  if (!decision) {
    throw new DeskError(
      "Every row needs a decision of DIFFERENT_ENTITY, SAME_ENTITY, or REVIEW.",
      { status: 400 },
    );
  }
  const name = stringOf(row.name);
  const reason = stringOf(row.reason) ?? "";
  const comparison = readComparison(row.comparison);
  const comparedName = comparison && comparison.name.customer !== "Not given" ? comparison.name.customer : null;
  const listedName =
    stringOf(row.listed_name) ??
    (comparison && comparison.name.hit !== "Not given" ? comparison.name.hit : null);
  return {
    hitId: stringOf(row.hit_id) ?? `H-ROW-${index + 1}`,
    alertId: stringOf(row.alert_id) ?? "",
    decision,
    reasonCode: stringOf(row.reason_code) ?? "",
    customerRecordId: stringOf(row.customer_record_id),
    customerInFile: null,
    reason,
    evidence: evidenceOf(row.evidence),
    comparison,
    closeness: readCloseness(row.closeness, comparison, decision),
    name: name ?? comparedName,
    listedName,
    customerDob:
      stringOf(row.customer_dob) ??
      stringOf(row.dob) ??
      (comparison && comparison.dateOfBirth.customer !== "Not given" ? comparison.dateOfBirth.customer : null),
    customerCountry:
      stringOf(row.customer_country) ??
      stringOf(row.country) ??
      (comparison && comparison.country.customer !== "Not given" ? comparison.country.customer : null),
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
  };
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
      "The CSV needs a header row. Expected columns include hit_id, alert_id, name, decision, and reason_code.",
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
  if (Array.isArray(parsed)) return objectsFrom(parsed);
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.hits)) return objectsFrom(record.hits);
    if (Array.isArray(record.rows)) return objectsFrom(record.rows);
    return [record];
  }
  throw new DeskError("JSON must be an array of rows, JSONL, or an object with a rows or hits list.", {
    status: 400,
  });
}

function parseJsonDocument(text: string, extension: "json" | "jsonl"): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new DeskError("The file is empty.", { status: 400 });
  if (extension === "jsonl" || (extension === "json" && looksLikeJsonl(trimmed))) return parseJsonl(trimmed);
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
      throw new DeskError("A line in this file was not valid JSON.", { status: 400 });
    }
  }
  if (rows.length === 0) throw new DeskError("The file has no rows to show.", { status: 400 });
  return rows;
}

function objectsFrom(values: unknown[]): Record<string, unknown>[] {
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DeskError("Each row must be a JSON object.", {
        status: 400,
        detail: `Item ${index + 1} is not an object.`,
      });
    }
    return value as Record<string, unknown>;
  });
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
  return text
    .split(/[|;]/)
    .map((part) => part.trim())
    .filter(Boolean);
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
