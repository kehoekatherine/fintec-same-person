import type { Explanation } from "@/lib/explanation";
import type { Decision, DeskCase, ResultRow } from "@/lib/types";

/**
 * Bias risk is the chance a match is unreliable because the name is common
 * or a fact is missing. Common tokens are common because many unrelated
 * people share them. The list is not a ranking of any country, religion,
 * or ethnicity, and it does not score criminality.
 */

const COMMON_TOKENS = new Set([
  "mohammed",
  "muhammad",
  "mohamed",
  "ali",
  "maria",
  "anna",
  "john",
  "james",
  "david",
  "jose",
  "wei",
  "li",
  "jean",
  "pierre",
  "smith",
  "garcia",
  "silva",
]);

const SAME_TOKEN = [
  ["mohammed", "muhammad", "mohamed"],
  ["tom", "thomas"],
];

const PLACEHOLDERS = new Set(["na", "n a", "test", "unknown", "xxx", "none", "null", "nil", "tbd", "abc"]);

const NOT_A_NAME = new Set([
  "unknown",
  "unknown screened name",
  "unknown listed name",
  "not given",
  "n a",
  "na",
]);

/** Particles and legal forms are not real name parts. */
const SKIP_PARTS = new Set([
  "al",
  "el",
  "bin",
  "bint",
  "ibn",
  "van",
  "von",
  "de",
  "da",
  "di",
  "del",
  "della",
  "den",
  "der",
  "dos",
  "das",
  "du",
  "la",
  "le",
  "st",
  "mac",
  "mc",
  "ben",
  "abu",
  "ap",
  "ltd",
  "limited",
  "gmbh",
  "sa",
  "inc",
  "llc",
  "plc",
  "corp",
  "corporation",
  "company",
  "co",
]);

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

export type BiasBand = "Low" | "Elevated" | "High";

export type BiasReason = {
  id: "name" | "date" | "country";
  label: string;
  points: number;
  detail: string;
};

export type BiasRisk = {
  total: number;
  band: BiasBand;
  reasons: BiasReason[];
};

type DateRel = "agree" | "contradict" | "missing";
type CountryRel = "agree" | "disagree" | "unknown";

type PartialDate = { year: number; month: number | null; day: number | null };

export type BiasInput = {
  decision: Decision;
  customerName: string | null;
  hitNames: string[];
  customerDob: string | null;
  hitDobs: string[];
  /** True when the hit date list is the case's own field, including an empty list. */
  hitDobKnown: boolean;
  customerCountries: string[];
  hitCountries: string[];
  /** True when the hit country list is the case's own field, including an empty list. */
  hitCountryKnown: boolean;
  reasonCode: string;
  reason: string;
};

export function biasRiskForCase(item: DeskCase): BiasRisk | null {
  return scoreBias({
    decision: item.resolution.decision,
    customerName: item.screened.name,
    hitNames: [item.hit.name, ...item.hit.aliases],
    customerDob: item.screened.dob,
    hitDobs: item.hit.dobs,
    hitDobKnown: true,
    customerCountries: item.screened.country ? [item.screened.country] : [],
    hitCountries: item.hit.countries,
    hitCountryKnown: true,
    reasonCode: item.resolution.reason_code,
    reason: item.resolution.reason,
  });
}

export function biasRiskForExplanation(item: Explanation): BiasRisk | null {
  if (item.screened && item.hit) {
    return scoreBias({
      decision: item.decision,
      customerName: item.screened.name,
      hitNames: [item.hit.name, ...item.hit.aliases],
      customerDob: item.screened.dob,
      hitDobs: item.hit.dobs,
      hitDobKnown: true,
      customerCountries: item.screened.country ? [item.screened.country] : [],
      hitCountries: item.hit.countries,
      hitCountryKnown: true,
      reasonCode: item.reasonCode,
      reason: item.reason,
    });
  }
  return biasRiskForRow({
    hitId: item.hitId,
    alertId: item.alertId,
    decision: item.decision,
    reasonCode: item.reasonCode,
    customerRecordId: item.customerRecordId,
    customerInFile: item.customerMissing ? false : null,
    reason: item.reason,
    evidence: item.evidenceIds,
    name: item.customerName,
    listedName: item.listedName,
    customerDob: item.customerDob,
    customerCountry: item.customerCountry,
    groundsChecked: item.groundsChecked,
    applicableCodes: item.applicableCodes,
    customerMissing: item.customerMissing,
    comparison: item.comparison,
    closeness: item.closeness,
  });
}

export function biasRiskForRow(row: ResultRow): BiasRisk | null {
  return scoreBias({
    decision: row.decision,
    customerName: row.name,
    hitNames: row.listedName ? [row.listedName] : [],
    customerDob: row.customerDob,
    hitDobs: [],
    hitDobKnown: false,
    customerCountries: row.customerCountry ? [row.customerCountry] : [],
    hitCountries: [],
    hitCountryKnown: false,
    reasonCode: row.reasonCode,
    reason: row.reason,
  });
}

export function scoreBias(input: BiasInput): BiasRisk | null {
  if (input.decision === "DIFFERENT_ENTITY") return null;

  const customerParts = realParts(input.customerName);
  const hitParts = hitNameParts(input);
  const nameAgrees = namesAgree(customerParts, hitParts, input);
  const name = nameReason(customerParts, hitParts);
  const date = dateReason(input);
  const country = countryReason(input, nameAgrees, singleCommonToken(customerParts, hitParts), date.relation);

  const total = Math.min(100, name.points + date.points + country.points);
  return {
    total,
    band: bandFor(total),
    reasons: [
      { id: "name", label: "Name breadth", points: name.points, detail: name.detail },
      { id: "date", label: "Date missing", points: date.points, detail: date.detail },
      { id: "country", label: "Country used as a stand-in", points: country.points, detail: country.detail },
    ],
  };
}

export function bandFor(total: number): BiasBand {
  if (total <= 29) return "Low";
  if (total <= 59) return "Elevated";
  return "High";
}

function nameReason(customerParts: string[], hitParts: string[]): { points: number; detail: string } {
  const sides = [customerParts, hitParts].filter((parts) => parts.length > 0);
  if (sides.length === 0) {
    return { points: 20, detail: "The compared name is unknown." };
  }
  const thinner = sides.reduce((left, right) => (thinness(left) <= thinness(right) ? left : right));
  if (distinctiveCount(thinner) >= 2) {
    return { points: 0, detail: "The compared name has two or more distinctive parts." };
  }
  return {
    points: 40,
    detail: "The compared name has only one real part, or its parts are very common tokens that many unrelated people share.",
  };
}

function thinness(parts: string[]): number {
  return distinctiveCount(parts) * 100 + parts.length;
}

function distinctiveCount(parts: string[]): number {
  return parts.filter((part) => !COMMON_TOKENS.has(part)).length;
}

function singleCommonToken(customerParts: string[], hitParts: string[]): boolean {
  return [customerParts, hitParts].some((parts) => parts.length === 1 && COMMON_TOKENS.has(parts[0]));
}

function namesAgree(customerParts: string[], hitParts: string[], input: BiasInput): boolean {
  if (/name agrees/i.test(input.reason)) return true;
  if (/could not be confirmed|does not match/i.test(input.reason)) return false;
  if (
    input.reasonCode === "NAME_DOB_LOCATION_MATCH" ||
    input.reasonCode === "NAME_DOB_MATCH" ||
    input.reasonCode === "NAME_LOCATION_MATCH"
  ) {
    return true;
  }
  if (input.reasonCode === "NAME_MISMATCH_VERIFIED") return false;
  return tokensAgree(customerParts, hitParts);
}

function tokensAgree(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  const count = matchCount(left, right);
  const shorter = Math.min(left.length, right.length);
  return count >= 2 || count === shorter;
}

function matchCount(left: string[], right: string[]): number {
  const used = new Array<boolean>(right.length).fill(false);
  let count = 0;
  for (const part of left) {
    const index = right.findIndex((other, position) => !used[position] && sameToken(part, other));
    if (index >= 0) {
      used[index] = true;
      count += 1;
    }
  }
  return count;
}

function sameToken(left: string, right: string): boolean {
  return tokenKey(left) === tokenKey(right);
}

function tokenKey(token: string): string {
  for (const group of SAME_TOKEN) {
    if (group.includes(token)) return group[0];
  }
  return token;
}

function hitNameParts(input: BiasInput): string[] {
  for (const name of input.hitNames) {
    const parts = realParts(name);
    if (parts.length) return parts;
  }
  return realParts(hitNameFromReason(input.reason));
}

function hitNameFromReason(reason: string): string | null {
  const match = reason.match(/hit's name (.+?)(?:, and nothing|\.)/i);
  const name = match?.[1]?.trim();
  if (!name || name.length > 160) return null;
  return name;
}

function dateReason(input: BiasInput): { relation: DateRel; points: number; detail: string } {
  const relation = dateRelation(input);
  if (relation === "agree") {
    return { relation, points: 0, detail: "The dates of birth agree." };
  }
  if (relation === "contradict") {
    return {
      relation,
      points: 10,
      detail: "The dates of birth contradict, so the hit is a weak candidate.",
    };
  }
  return { relation, points: 30, detail: "The date of birth is missing or cannot be compared." };
}

function dateRelation(input: BiasInput): DateRel {
  if (input.hitDobKnown) return structuredDates(input.customerDob, input.hitDobs);
  const stated = dateFromReason(input.reason);
  if (stated) return stated;
  if (input.reasonCode === "DOB_MISMATCH") return "contradict";
  if (
    input.reasonCode === "NAME_DOB_LOCATION_MATCH" ||
    input.reasonCode === "NAME_DOB_MATCH"
  ) {
    return "agree";
  }
  return structuredDates(input.customerDob, input.hitDobs);
}

function dateFromReason(reason: string): DateRel | null {
  const text = reason.toLowerCase();
  if (text.includes("dates of birth agree") || /date of birth [^.]* agrees with/.test(text)) return "agree";
  if (
    /birth dates?[^.]{0,80}contradict/.test(text) ||
    /dates of birth[^.]{0,80}contradict/.test(text) ||
    /contradicts the customer/.test(text)
  ) {
    return "contradict";
  }
  if (text.includes("cannot be compared") || text.includes("not close enough")) return "missing";
  return null;
}

function structuredDates(customerDob: string | null, hitDobs: string[]): DateRel {
  const customers = parseDates(customerDob);
  const hits = hitDobs.flatMap((value) => parseDates(value));
  if (!customers.length || !hits.length) return "missing";
  const relations = new Set<DateRel>();
  for (const customer of customers) {
    if (hits.some((hit) => datesAgree(customer, hit))) relations.add("agree");
    else if (hits.every((hit) => datesContradict(customer, hit))) relations.add("contradict");
    else relations.add("missing");
  }
  if (relations.size === 1 && relations.has("agree")) return "agree";
  if (relations.size === 1 && relations.has("contradict")) return "contradict";
  return "missing";
}

function countryReason(
  input: BiasInput,
  nameAgrees: boolean,
  singleCommon: boolean,
  date: DateRel,
): { points: number; detail: string } {
  const relation = countryRelation(input);
  if (relation === "unknown") {
    return { points: 10, detail: "Country is unknown." };
  }
  if (relation === "disagree") {
    return { points: 0, detail: "The countries disagree, so country is not standing in for the match." };
  }
  const nameIsWeak = !nameAgrees || singleCommon;
  if (nameIsWeak && date !== "agree") {
    return {
      points: 30,
      detail: "Country is the only agreeing fact, so it is standing in for the name or the date.",
    };
  }
  return { points: 0, detail: "Country is not the only agreeing fact." };
}

function countryRelation(input: BiasInput): CountryRel {
  if (input.hitCountryKnown) {
    const customer = present(input.customerCountries);
    const hit = present(input.hitCountries);
    if (customer.length && hit.length) {
      return overlaps(customer, hit) ? "agree" : "disagree";
    }
  }
  return countryFromReason(input.reason, input.reasonCode) ?? "unknown";
}

function countryFromReason(reason: string, reasonCode: string): CountryRel | null {
  const text = reason.toLowerCase();
  if (text.includes("both the customer and the hit are linked to")) return "agree";
  if (text.includes("no country")) return "unknown";
  if (text.includes("linked only to") || text.includes("every country on one side differs")) return "disagree";
  if (/customer is linked to [\s\S]+ and the hit is linked to/.test(text)) return "disagree";
  if (reasonCode === "NAME_DOB_LOCATION_MATCH" || reasonCode === "NAME_LOCATION_MATCH") return "agree";
  if (reasonCode === "LOCATION_MISMATCH") return "disagree";
  if (reasonCode === "NAME_DOB_MATCH") return "unknown";
  return null;
}

function present(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function overlaps(left: string[], right: string[]): boolean {
  const folded = new Set(right.map((value) => fold(value)));
  return left.some((value) => folded.has(fold(value)));
}

export function realParts(value: string | null | undefined): string[] {
  if (!value) return [];
  const text = value.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const folded = fold(text);
  if (!folded || NOT_A_NAME.has(folded) || PLACEHOLDERS.has(folded)) return [];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const token of folded.split(" ")) {
    if (PLACEHOLDERS.has(token) || SKIP_PARTS.has(token) || /^\d+$/.test(token) || !/[a-z]/.test(token)) continue;
    if (token.length < 2 || seen.has(token)) continue;
    seen.add(token);
    parts.push(token);
  }
  return parts;
}

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDates(value: string | null | undefined): PartialDate[] {
  if (!value || !value.trim()) return [];
  const found: PartialDate[] = [];
  for (const part of value.split(/\s+or\s+/i)) {
    const parsed = parseDate(part.trim());
    if (parsed) found.push(parsed);
  }
  return found;
}

function parseDate(text: string): PartialDate | null {
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return partial(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) return partial(Number(match[1]), Number(match[2]), null);
  match = text.match(/^(\d{4})$/);
  if (match) return partial(Number(match[1]), null, null);
  match = text.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (match && MONTHS[match[1].toLowerCase()]) {
    return partial(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
  }
  match = text.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (match && MONTHS[match[2].toLowerCase()]) {
    return partial(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  }
  match = text.match(/^([A-Za-z]+) (\d{4})$/);
  if (match && MONTHS[match[1].toLowerCase()]) {
    return partial(Number(match[2]), MONTHS[match[1].toLowerCase()], null);
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    if (first > 12) return partial(year, second, first);
    if (second > 12) return partial(year, first, second);
    return partial(year, second, first);
  }
  return null;
}

function partial(year: number, month: number | null, day: number | null): PartialDate | null {
  if (month != null && (month < 1 || month > 12)) return null;
  if (day != null && (day < 1 || day > 31)) return null;
  if (year < 1800 || year > 2100) return null;
  return { year, month, day };
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
