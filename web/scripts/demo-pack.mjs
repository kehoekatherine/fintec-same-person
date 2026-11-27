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
  const measured = measureRecordedRun(text);
  const dest = path.join(webRoot, "public", "demo");
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, "development.json"), JSON.stringify(payload));
  await writeFile(path.join(dest, "cost.json"), `${JSON.stringify(measured, null, 2)}\n`);
  return { payload, measured };
}

/** Character counts on the committed JSONL. Tokens are characters divided by 4, not a tokenizer. */
export function measureRecordedRun(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  const chars = [];
  const reasons = [];
  const decisions = { different: 0, same: 0, review: 0 };
  const codes = new Map();
  const pairFields = {
    name: emptyStatuses(),
    dateOfBirth: emptyStatuses(),
    country: emptyStatuses(),
  };
  const agreeing = [0, 0, 0, 0];
  let pairs = 0;
  for (const line of lines) {
    const parsed = JSON.parse(line);
    chars.push(line.length);
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    reasons.push(reason.length);
    if (parsed.decision === "DIFFERENT_ENTITY") decisions.different += 1;
    else if (parsed.decision === "SAME_ENTITY") decisions.same += 1;
    else if (parsed.decision === "REVIEW") decisions.review += 1;
    const code = typeof parsed.reason_code === "string" ? parsed.reason_code : "";
    if (code) codes.set(code, (codes.get(code) ?? 0) + 1);
    const counted = countPair(parsed.comparison, pairFields);
    if (counted != null) {
      pairs += 1;
      agreeing[counted] += 1;
    }
  }
  const sortedChars = [...chars].sort((a, b) => a - b);
  const sortedReasons = [...reasons].sort((a, b) => a - b);
  const reasonCodes = [...codes.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return {
    hits: lines.length,
    method:
      "Characters in each recorded output/dev.jsonl line, divided by 4. This estimates tokens. It is not a provider tokenizer, and it is not the customer source folder, which is not in this repository.",
    charsMean: mean(chars),
    charsP50: quantile(sortedChars, 0.5),
    charsP90: quantile(sortedChars, 0.9),
    reasonCharsMean: mean(reasons),
    inputTokensMean: tokens(mean(chars)),
    inputTokensP50: tokens(quantile(sortedChars, 0.5)),
    inputTokensP90: tokens(quantile(sortedChars, 0.9)),
    reasonTokensMean: tokens(mean(reasons)),
    reasonTokensP50: tokens(quantile(sortedReasons, 0.5)),
    decisions,
    reasonCodes,
    resolverSeconds: null,
    labelsPresent: false,
    pairFeatures: {
      pairs,
      note:
        "Each output/dev.jsonl line is one customer–hit comparison the rules already stored. The customer file is not here, so this is not a Fellegi–Sunter run and not a clustering of customers. It only counts the three stored statuses. Labels are not used. It does not check the rules.",
      name: pairFields.name,
      dateOfBirth: pairFields.dateOfBirth,
      country: pairFields.country,
      fieldsAgreeing: agreeing.map((count, agree) => ({ agree, count })),
    },
  };
}

function emptyStatuses() {
  return { match: 0, different: 0, undefined: 0 };
}

function countPair(comparison, pairFields) {
  if (!comparison || typeof comparison !== "object") return null;
  const name = statusOf(comparison.name);
  const dateOfBirth = statusOf(comparison.date_of_birth);
  const country = statusOf(comparison.country);
  if (!name || !dateOfBirth || !country) return null;
  pairFields.name[name] += 1;
  pairFields.dateOfBirth[dateOfBirth] += 1;
  pairFields.country[country] += 1;
  return [name, dateOfBirth, country].filter((status) => status === "match").length;
}

function statusOf(value) {
  if (!value || typeof value !== "object") return null;
  if (value.status === "match" || value.status === "different" || value.status === "undefined") return value.status;
  return null;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function tokens(chars) {
  return Math.round(chars / 4);
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
