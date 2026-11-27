import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const POINTS = {
  name: { match: 40, undefined: 15, different: 0 },
  dateOfBirth: { match: 30, undefined: 10, different: 0 },
  country: { match: 30, undefined: 10, different: 0 },
};

const NOTICE =
  "These are the recorded decisions in output/dev.jsonl. The public desk does not include the customer source files, does not re-run the resolver, and does not call a model. Name, date of birth, and country are the values already compared. A file that already has a decision on every row can still be added in this browser.";

export function payloadFromDevJsonl(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    rows.push(rowFromRecord(JSON.parse(line)));
  }
  return {
    source: "development",
    mode: "recorded",
    datasetName: "Recorded development run",
    notice: NOTICE,
    rows,
  };
}

export async function writeDemoPack(repoRoot, webRoot) {
  const text = await readFile(path.join(repoRoot, "output", "dev.jsonl"), "utf8");
  const payload = payloadFromDevJsonl(text);
  const dest = path.join(webRoot, "public", "demo");
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, "development.json"), JSON.stringify(payload));
  return payload;
}

function rowFromRecord(parsed) {
  const decision = typeof parsed.decision === "string" ? parsed.decision : "";
  const comparison = comparisonOf(parsed.comparison);
  return {
    hitId: typeof parsed.hit_id === "string" ? parsed.hit_id : "",
    alertId: typeof parsed.alert_id === "string" ? parsed.alert_id : "",
    decision,
    reasonCode: typeof parsed.reason_code === "string" ? parsed.reason_code : "",
    customerRecordId: typeof parsed.customer_record_id === "string" ? parsed.customer_record_id : null,
    customerInFile: null,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((item) => typeof item === "string") : [],
    comparison,
    closeness: closenessOf(parsed.closeness, comparison, decision),
    name: shown(comparison?.name.customer),
    listedName: shown(comparison?.name.hit),
    customerDob: shown(comparison?.dateOfBirth.customer),
    customerCountry: shown(comparison?.country.customer),
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
  };
}

function comparisonOf(value) {
  if (!value || typeof value !== "object") return null;
  const name = fact(value.name);
  const dateOfBirth = fact(value.date_of_birth);
  const country = fact(value.country);
  if (!name || !dateOfBirth || !country) return null;
  return { name, dateOfBirth, country };
}

function fact(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.customer !== "string" || typeof value.hit !== "string") return null;
  if (value.status !== "match" && value.status !== "different" && value.status !== "undefined") return null;
  return {
    customer: value.customer.trim() || "Not given",
    hit: value.hit.trim() || "Not given",
    status: value.status,
  };
}

function closenessOf(value, comparison, decision) {
  if (decision === "DIFFERENT_ENTITY") return null;
  if (!value || typeof value !== "object") return null;
  const name = point(value.name, POINTS.name);
  const dateOfBirth = point(value.date_of_birth, POINTS.dateOfBirth);
  const country = point(value.country, POINTS.country);
  if (name == null || dateOfBirth == null || country == null) return null;
  if (typeof value.total !== "number" || value.total !== name + dateOfBirth + country) return null;
  const band = value.total >= 80 ? "Close" : value.total >= 40 ? "Partial" : "Distant";
  if (value.band !== band) return null;
  if (comparison) {
    if (name !== POINTS.name[comparison.name.status]) return null;
    if (dateOfBirth !== POINTS.dateOfBirth[comparison.dateOfBirth.status]) return null;
    if (country !== POINTS.country[comparison.country.status]) return null;
  }
  return { total: value.total, band, name, dateOfBirth, country };
}

function point(value, allowed) {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (!Object.values(allowed).includes(value)) return null;
  return value;
}

function shown(value) {
  if (!value || value === "Not given") return null;
  return value;
}
