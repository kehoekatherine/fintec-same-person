import { countryKeys, displayCountry, foldText } from "@/lib/countries";
import { groundsToShow, type Explanation } from "@/lib/explanation";
import { formatWhen } from "@/lib/format";
import { DECISION_LABEL, reasonLabel } from "@/lib/labels";
import type { Comparison, Decision } from "@/lib/types";

export type CompareStatus = "Match" | "Different" | "Undefined";

export type CompareRow = {
  id: "name" | "dob" | "country" | "entity";
  label: string;
  customer: string;
  hit: string;
  status: CompareStatus;
};

export type SourceLine = {
  id: string;
  type: string;
  missing: boolean;
};

export type CaseComparisonModel = {
  rows: CompareRow[];
  decision: Decision;
  decisionLabel: string;
  reason: string;
  also: string[];
  action: string;
  sources: SourceLine[];
};

const NOT_GIVEN = "Not given";

const ACTION: Record<Decision, string> = {
  SAME_ENTITY: "Do not clear this hit.",
  DIFFERENT_ENTITY: "This hit can be cleared; the alert stays open until every hit on it is cleared.",
  REVIEW: "A person decides; do not clear it.",
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_PATTERN = "January|February|March|April|May|June|July|August|September|October|November|December";

const PLACEHOLDERS = new Set(["na", "n a", "test", "unknown", "xxx", "none", "null", "nil", "tbd", "abc"]);
const LEGAL_FORMS = new Set([
  "ltd",
  "limited",
  "gmbh",
  "inc",
  "llc",
  "plc",
  "lp",
  "llp",
  "corp",
  "corporation",
  "co",
  "company",
  "sarl",
  "srl",
  "ag",
  "nv",
  "bv",
  "oy",
  "ab",
  "aps",
  "spa",
  "sas",
  "sl",
]);

const VARIANT_GROUPS = [
  ["tom", "thomas"],
  ["mohammed", "mohamed", "muhammad", "mohammad", "muhammed", "mohamad", "mohd"],
];

const PART_GROUPS = new Map<string, Set<number>>();
for (const [index, group] of VARIANT_GROUPS.entries()) {
  for (const name of group) {
    const key = foldText(name);
    const set = PART_GROUPS.get(key) ?? new Set<number>();
    set.add(index);
    PART_GROUPS.set(key, set);
  }
}

type PartialDate = { year: number; month: number | null; day: number | null };
type Explicit = "match" | "different" | "undefined" | null;

type ParsedReason = {
  customerName: string | null;
  hitName: string | null;
  nameExplicit: Explicit;
  customerDob: string | null;
  hitDob: string | null;
  customerCountry: string | null;
  hitCountry: string | null;
  countryExplicit: Explicit;
  customerEntity: string | null;
  hitEntity: string | null;
};

type Facts = {
  decision: Decision;
  reasonCode: string;
  reason: string;
  rechecked: boolean;
  applicableCodes: readonly string[];
  evidence: string[];
  missingCustomerId: string | null;
  customerName: string | null;
  hitName: string | null;
  customerDob: string | null;
  hitDob: string | null;
  customerCountry: string | null;
  hitCountry: string | null;
  customerEntity: string | null;
  hitEntity: string | null;
  stored: Comparison | null;
};

export function comparisonFromExplanation(item: Explanation): CaseComparisonModel {
  const screened = item.screened;
  const hit = item.hit;
  return buildComparison({
    decision: item.decision,
    reasonCode: item.reasonCode,
    reason: item.reason,
    rechecked: item.groundsChecked,
    applicableCodes: item.applicableCodes,
    evidence: item.evidenceIds,
    missingCustomerId: missingCustomerId(item),
    customerName: cleanName(screened?.name ?? item.customerName),
    hitName: cleanName(hit?.name ?? item.listedName),
    customerDob: screened?.dob ?? item.customerDob,
    hitDob: hit ? joinList(hit.dobs) : null,
    customerCountry: screened?.country ?? item.customerCountry,
    hitCountry: hit ? joinList([...hit.countries, ...hit.nationality]) : null,
    customerEntity: screened?.entityType ?? null,
    hitEntity: hit?.entityType ?? null,
    stored: item.comparison,
  });
}

function missingCustomerId(item: Explanation): string | null {
  const id = item.customerRecordId;
  if (item.customerMissing && id && id !== "AMBIGUOUS") return id;
  const noted = item.customerNote?.match(/^(\S+) is not in customers\.jsonl\./);
  return noted?.[1] ?? null;
}

function buildComparison(facts: Facts): CaseComparisonModel {
  const parsed = parseReason(facts.reason);
  const customerName = cleanName(facts.customerName) ?? parsed.customerName;
  const hitName = cleanName(facts.hitName) ?? parsed.hitName;
  const customerDob = textOr(facts.customerDob, parsed.customerDob);
  const hitDob = textOr(facts.hitDob, parsed.hitDob);
  const customerCountry = parsed.customerCountry ?? textOr(facts.customerCountry, null);
  const hitCountry = parsed.hitCountry ?? textOr(facts.hitCountry, null);
  const customerEntity = textOr(facts.customerEntity, parsed.customerEntity);
  const hitEntity = textOr(facts.hitEntity, parsed.hitEntity);
  const customerCompany = entityKind(customerEntity) === "company";
  const hitCompany = entityKind(hitEntity) === "company";

  const rows: CompareRow[] = [
    {
      id: "name",
      label: "Name",
      customer: customerName ?? NOT_GIVEN,
      hit: hitName ?? NOT_GIVEN,
      status: nameStatus(customerName, hitName, customerCompany, hitCompany, parsed.nameExplicit),
    },
    {
      id: "dob",
      label: "Date of birth",
      customer: displayDob(customerDob),
      hit: displayDob(hitDob),
      status: dobStatus(customerDob, hitDob),
    },
    countryRow(customerCountry, hitCountry, parsed.countryExplicit),
    {
      id: "entity",
      label: "Entity type",
      customer: displayEntity(customerEntity),
      hit: displayEntity(hitEntity),
      status: entityStatus(customerEntity, hitEntity),
    },
  ];

  return {
    rows: applyStoredComparison(rows, facts.stored),
    decision: facts.decision,
    decisionLabel: DECISION_LABEL[facts.decision],
    reason: facts.reasonCode ? reasonLabel(facts.reasonCode) : "No reason code was stored.",
    also: extraReasons(facts),
    action: ACTION[facts.decision],
    sources: sourceLines(facts.evidence, facts.missingCustomerId),
  };
}

const STORED_STATUS = { match: "Match", different: "Different", undefined: "Undefined" } as const;

function applyStoredComparison(rows: CompareRow[], stored: Comparison | null): CompareRow[] {
  if (!stored) return rows;
  const facts = { name: stored.name, dob: stored.dateOfBirth, country: stored.country };
  return rows.map((row) => {
    const fact = facts[row.id as keyof typeof facts];
    if (!fact) return row;
    return {
      ...row,
      customer: row.id === "dob" ? displayDob(fact.customer) : fact.customer.trim() || NOT_GIVEN,
      hit: row.id === "dob" ? displayDob(fact.hit) : fact.hit.trim() || NOT_GIVEN,
      status: STORED_STATUS[fact.status],
    };
  });
}

function extraReasons(facts: Facts): string[] {
  if (!facts.rechecked) return [];
  return groundsToShow(facts.reasonCode, true, facts.applicableCodes)
    .filter((code) => code !== facts.reasonCode)
    .map((code) => `Also true: ${reasonLabel(code)}`);
}

function sourceLines(evidence: string[], missingCustomerId: string | null): SourceLine[] {
  const lines: SourceLine[] = [];
  const seen = new Set<string>();
  for (const id of evidence) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    lines.push({
      id: trimmed,
      type: sourceType(trimmed),
      missing: missingCustomerId != null && trimmed === missingCustomerId,
    });
  }
  if (missingCustomerId && !seen.has(missingCustomerId)) {
    lines.push({
      id: missingCustomerId,
      type: sourceType(missingCustomerId),
      missing: true,
    });
  }
  return lines;
}

function sourceType(id: string): string {
  if (id.startsWith("CUS-")) return "customer record";
  if (id.startsWith("NOTE-")) return "note";
  if (id.startsWith("KYC-")) return "identity check";
  if (id.startsWith("SR-")) return "search result";
  return "record";
}

function countryRow(customer: string | null, hit: string | null, explicit: Explicit): CompareRow {
  const left = countryCell(customer);
  const right = countryCell(hit);
  let status: CompareStatus = "Undefined";
  if (explicit === "undefined" || left.keys.length === 0 || right.keys.length === 0) status = "Undefined";
  else if (left.keys.some((key) => right.keys.includes(key))) status = "Match";
  else status = "Different";
  return { id: "country", label: "Country", customer: left.text, hit: right.text, status };
}

function countryCell(value: string | null): { text: string; keys: string[] } {
  if (!value?.trim()) return { text: NOT_GIVEN, keys: [] };
  const keys = countryKeys(value);
  if (keys.length === 0) return { text: value.trim(), keys: [] };
  return { text: keys.map(displayCountry).join(", "), keys };
}

function nameStatus(
  customer: string | null,
  hit: string | null,
  customerCompany: boolean,
  hitCompany: boolean,
  explicit: Explicit,
): CompareStatus {
  if (!customer || !hit) return "Undefined";
  if (explicit === "different") return "Different";
  if (explicit === "undefined") return "Undefined";
  if (explicit === "match") return "Match";
  const left = tokenize(customer, customerCompany);
  const right = tokenize(hit, hitCompany);
  if (left.length === 0 || right.length === 0) return "Undefined";
  if (namesAgree(left, right)) return "Match";
  if (left.length >= 2 && right.length >= 2) return "Different";
  return "Undefined";
}

function dobStatus(customer: string | null, hit: string | null): CompareStatus {
  if (!customer || !hit) return "Undefined";
  const relation = dobRelation(parsePartials(customer), parsePartials(hit));
  if (relation === "agree") return "Match";
  if (relation === "contradict") return "Different";
  return "Undefined";
}

function entityStatus(customer: string | null, hit: string | null): CompareStatus {
  if (!customer || !hit) return "Undefined";
  const left = entityKind(customer);
  const right = entityKind(hit);
  if (left && right) return left === right ? "Match" : "Different";
  if (foldText(customer) === foldText(hit)) return "Match";
  return "Undefined";
}

function entityKind(value: string | null): "person" | "company" | "" {
  const key = foldText(value ?? "");
  if (key === "individual" || key === "person" || key === "natural person") return "person";
  if (key === "company" || key === "organisation" || key === "organization" || key === "business" || key === "entity") {
    return "company";
  }
  return "";
}

function displayEntity(value: string | null): string {
  if (!value?.trim()) return NOT_GIVEN;
  const key = foldText(value);
  if (key === "person") return "Person";
  if (key === "company") return "Company";
  return value.trim();
}

function displayDob(value: string | null): string {
  if (!value?.trim()) return NOT_GIVEN;
  const text = value.trim();
  if (/\bor\b|,/.test(text)) return text;
  const dates = parsePartials(text);
  if (dates.length !== 1) return text;
  const date = dates[0];
  if (date.month && date.day) return formatWhen(iso(date));
  if (date.month) return `${MONTH_NAMES[date.month - 1]} ${date.year}`;
  return String(date.year);
}

function parseReason(reason: string): ParsedReason {
  const parsed: ParsedReason = {
    customerName: null,
    hitName: null,
    nameExplicit: null,
    customerDob: null,
    hitDob: null,
    customerCountry: null,
    hitCountry: null,
    countryExplicit: null,
    customerEntity: null,
    hitEntity: null,
  };
  const verifiedMismatch = reason.match(
    /The customer's verified name is (.+?)(?: \([A-Z]+-[A-Z0-9]+\))?, which does not match the hit's name (.+?)\./,
  );
  const verifiedUncalled = reason.match(
    /The customer's verified name (.+?) could not be confirmed against the hit's name (.+?)\./,
  );
  const nameUncalled = reason.match(/The customer's name could not be confirmed against the hit's name (.+?)\./);
  const nameAgrees = reason.match(/The customer's name agrees with the hit's name (.+?), and nothing in the records contradicts the hit\./);
  const nameAgreesStop = reason.match(/The customer's name agrees with the hit's name (.+?)\./);
  if (verifiedMismatch) {
    parsed.customerName = verifiedMismatch[1].trim();
    parsed.hitName = verifiedMismatch[2].trim();
    parsed.nameExplicit = "different";
  } else if (verifiedUncalled) {
    parsed.customerName = verifiedUncalled[1].trim();
    parsed.hitName = verifiedUncalled[2].trim();
    parsed.nameExplicit = "undefined";
  } else if (nameUncalled && !nameAgrees && !nameAgreesStop) {
    parsed.hitName = nameUncalled[1].trim();
    parsed.nameExplicit = "undefined";
  } else if (nameAgrees) {
    parsed.hitName = nameAgrees[1].trim();
    parsed.nameExplicit = "match";
  } else if (nameAgreesStop) {
    parsed.hitName = nameAgreesStop[1].trim();
    parsed.nameExplicit = "match";
  }

  const dobAgrees = reason.match(
    /The customer's date of birth (\S+)(?: \([A-Z]+-[A-Z0-9]+\))? agrees with the hit's ([^.]+)\./,
  );
  const dobContradicts = reason.match(
    /The customer's date of birth is (\S+)(?: \([A-Z]+-[A-Z0-9]+\))? but the hit's (?:listed date of birth is|profile notes put its birth year at|search results put its birth year at) ([^.]+)\./,
  );
  const born = reason.match(/The customer was born in (\S+)(?: \([A-Z]+-[A-Z0-9]+\))?/);
  const incorporated = reason.match(/The customer was incorporated on (\S+)(?: \([A-Z]+-[A-Z0-9]+\))?/);
  if (dobAgrees) {
    parsed.customerDob = dobAgrees[1];
    parsed.hitDob = dobAgrees[2].trim();
  } else if (dobContradicts) {
    parsed.customerDob = dobContradicts[1];
    parsed.hitDob = dobContradicts[2].trim();
  } else if (born) {
    parsed.customerDob = born[1];
  } else if (incorporated) {
    parsed.customerDob = incorporated[1];
  }

  const bothLinked = reason.match(/Both the customer and the hit are linked to ([^.]+)\./);
  const onlyLinked = reason.match(/The customer is linked only to (.+?) but the hit is linked only to ([^.]+)\./);
  const eachLinked = reason.match(/The customer is linked to (.+?) and the hit is linked to ([^.]+)\./);
  if (bothLinked) {
    parsed.customerCountry = bothLinked[1].trim();
    parsed.hitCountry = bothLinked[1].trim();
    parsed.countryExplicit = "match";
  } else if (onlyLinked) {
    parsed.customerCountry = onlyLinked[1].trim();
    parsed.hitCountry = onlyLinked[2].trim();
    parsed.countryExplicit = "different";
  } else if (eachLinked) {
    parsed.customerCountry = eachLinked[1].trim();
    parsed.hitCountry = eachLinked[2].trim();
  } else if (reason.includes("one side has no country to compare")) {
    parsed.countryExplicit = "undefined";
  }

  const kinds = reason.match(/The resolved customer is a (person|company) \([^)]+\) and the hit is a (person|company)\./);
  if (kinds) {
    parsed.customerEntity = kinds[1];
    parsed.hitEntity = kinds[2];
  }
  return parsed;
}

function parsePartials(value: string): PartialDate[] {
  const found: { start: number; end: number; date: PartialDate }[] = [];
  const occupied: [number, number][] = [];
  const patterns: { expression: RegExp; build: (match: RegExpExecArray) => PartialDate | null }[] = [
    {
      expression: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      build: (match) => partial(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      expression: /\b(\d{4})-(\d{2})\b/g,
      build: (match) => partial(Number(match[1]), Number(match[2]), null),
    },
    {
      expression: new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s+(\\d{4})\\b`, "gi"),
      build: (match) => partial(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])),
    },
    {
      expression: new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "gi"),
      build: (match) => partial(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1])),
    },
    {
      expression: new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "gi"),
      build: (match) => partial(Number(match[2]), MONTHS[match[1].toLowerCase()], null),
    },
    {
      expression: /\b(\d{4})\b/g,
      build: (match) => partial(Number(match[1]), null, null),
    },
  ];
  for (const pattern of patterns) {
    pattern.expression.lastIndex = 0;
    for (const match of value.matchAll(pattern.expression)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (occupied.some(([lo, hi]) => start < hi && end > lo)) continue;
      const date = pattern.build(match);
      if (!date) continue;
      found.push({ start, end, date });
      occupied.push([start, end]);
    }
  }
  found.sort((left, right) => left.start - right.start);
  return found.map((item) => item.date);
}

function partial(year: number, month: number | null, day: number | null): PartialDate | null {
  if (!Number.isInteger(year) || year < 1800 || year > 2200) return null;
  if (month != null && (month < 1 || month > 12)) return null;
  if (day != null && (day < 1 || day > 31)) return null;
  return { year, month, day };
}

function iso(date: PartialDate): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

function datesAgree(customer: PartialDate, hit: PartialDate): boolean {
  if (customer.year !== hit.year) return false;
  if (customer.month && hit.month && customer.month !== hit.month) return false;
  if (customer.day && hit.day && customer.day !== hit.day) return false;
  return true;
}

function datesContradict(customer: PartialDate, hit: PartialDate): boolean {
  if (Math.abs(customer.year - hit.year) > 1) return true;
  if (customer.year === hit.year && customer.month && hit.month && customer.month !== hit.month) return true;
  if (
    customer.year === hit.year &&
    customer.month &&
    hit.month &&
    customer.month === hit.month &&
    customer.day &&
    hit.day &&
    customer.day !== hit.day
  ) {
    return true;
  }
  return false;
}

function dobRelation(customerDates: PartialDate[], hitDates: PartialDate[]): "agree" | "contradict" | "unknown" {
  if (customerDates.length === 0 || hitDates.length === 0) return "unknown";
  const relations = new Set<string>();
  for (const customer of customerDates) {
    if (hitDates.some((hit) => datesAgree(customer, hit))) relations.add("agree");
    else if (hitDates.every((hit) => datesContradict(customer, hit))) relations.add("contradict");
    else relations.add("unknown");
  }
  if (relations.size === 1 && relations.has("agree")) return "agree";
  if (relations.size === 1 && relations.has("contradict")) return "contradict";
  return "unknown";
}

function tokenize(value: string, company: boolean): string[] {
  const text = value.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const token of foldText(text).split(" ")) {
    if (!token || PLACEHOLDERS.has(token) || /^\d+$/.test(token) || !/[a-z]/.test(token)) continue;
    if (token.length < 2) continue;
    if (company && LEGAL_FORMS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    parts.push(token);
  }
  return parts;
}

function partsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const leftGroups = PART_GROUPS.get(left);
  const rightGroups = PART_GROUPS.get(right);
  if (leftGroups && rightGroups && [...leftGroups].some((group) => rightGroups.has(group))) return true;
  const shorter = Math.min(left.length, right.length);
  if (shorter < 4) return false;
  const limit = shorter <= 6 ? 1 : 2;
  return editDistance(left, right, limit) <= limit;
}

function namesAgree(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  for (const xs of configurations(left)) {
    for (const ys of configurations(right)) {
      const count = matchCount(xs, ys);
      const shorter = Math.min(xs.length, ys.length);
      if (count >= 2 || (shorter > 0 && count === shorter)) return true;
    }
  }
  return false;
}

function configurations(parts: string[]): string[][] {
  const results: string[][] = [];
  const walk = (index: number, acc: string[]) => {
    if (index >= parts.length) {
      results.push([...acc]);
      return;
    }
    acc.push(parts[index]);
    walk(index + 1, acc);
    acc.pop();
    if (index + 1 < parts.length) {
      acc.push(parts[index] + parts[index + 1]);
      walk(index + 2, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return results;
}

function matchCount(xs: string[], ys: string[]): number {
  let best = 0;
  const used = ys.map(() => false);
  const walk = (index: number, count: number) => {
    if (count > best) best = count;
    if (index === xs.length || count + (xs.length - index) <= best) return;
    walk(index + 1, count);
    for (let j = 0; j < ys.length; j += 1) {
      if (used[j]) continue;
      if (!partsMatch(xs[index], ys[j])) continue;
      used[j] = true;
      walk(index + 1, count + 1);
      used[j] = false;
    }
  };
  walk(0, 0);
  return best;
}

function editDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  if (left === right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= right.length; j += 1) {
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      current.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[previous.length - 1];
}

function cleanName(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const text = value.trim();
  if (text === "Unknown screened name" || text === "Unknown listed name") return null;
  return text;
}

function textOr(primary: string | null | undefined, fallback: string | null): string | null {
  if (primary?.trim()) return primary.trim();
  return fallback;
}

function joinList(values: string[]): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.length ? parts.join(", ") : null;
}
