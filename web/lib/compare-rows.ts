import type { Comparison, FactStatus } from "./types";

export type CompareStatus = "Match" | "Different" | "Undefined";

export type CompareDisplayRow = {
  id: "name" | "dob" | "country" | "city" | "entity";
  label: string;
  customer: string;
  hit: string;
  status: CompareStatus;
};

export type OtherLine = {
  id: string;
  label: string;
  line: string;
};

export type CaseFacts = {
  packPresent: boolean;
  hitPresent: boolean;
  customerInFile: boolean | null;
  customerMessage: string | null;
  core: CompareDisplayRow[];
  city: CompareDisplayRow | null;
  entity: CompareDisplayRow | null;
  others: OtherLine[];
};

export const CUSTOMER_FILE_ABSENT = "The customer file is not on this machine.";
const NOT_GIVEN = "Not given";

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

type PartialDate = { year: number; month: number | null; day: number | null };

export function statusWord(status: FactStatus): CompareStatus {
  if (status === "match") return "Match";
  if (status === "different") return "Different";
  return "Undefined";
}

export function rowsFromStored(comparison: Comparison): CompareDisplayRow[] {
  return [
    row("name", "Name", comparison.name.customer, comparison.name.hit, statusWord(comparison.name.status)),
    row(
      "dob",
      "Date of birth",
      comparison.dateOfBirth.customer,
      comparison.dateOfBirth.hit,
      statusWord(comparison.dateOfBirth.status),
    ),
    row(
      "country",
      "Country",
      comparison.country.customer,
      comparison.country.hit,
      statusWord(comparison.country.status),
    ),
  ];
}

export function customerAbsenceMessage(id: string | null, inFile: boolean | null): string | null {
  if (id === "AMBIGUOUS") {
    return "More than one customer fits this alert. No single customer record is selected.";
  }
  if (inFile === false && id) return `${id} is not in customers.jsonl.`;
  return null;
}

export function comparisonRows(options: {
  packPresent: boolean;
  hitPresent: boolean;
  customerInFile: boolean | null;
  stored: Comparison | null;
  core: CompareDisplayRow[];
  city: CompareDisplayRow | null;
  entity: CompareDisplayRow | null;
}): CompareDisplayRow[] {
  if (!options.packPresent) return [];
  if (!options.hitPresent && options.customerInFile !== true) return [];
  const core = options.stored ? rowsFromStored(options.stored) : options.core;
  const rows = [...core];
  if (options.city) rows.push(options.city);
  rows.push(
    options.entity ?? {
      id: "entity",
      label: "Entity type",
      customer: NOT_GIVEN,
      hit: NOT_GIVEN,
      status: "Undefined",
    },
  );
  return rows;
}

export function coreRows(input: {
  customerName: string | null;
  hitNames: string[];
  customerDob: string | null;
  hitDobs: string[];
  customerCountries: string[];
  hitCountries: string[];
  legalForms: readonly string[];
  variantGroups: readonly (readonly string[])[];
  canon: (value: string) => string | null;
}): CompareDisplayRow[] {
  const hitName = input.hitNames.find((name) => name.trim()) ?? null;
  return [
    row(
      "name",
      "Name",
      input.customerName,
      hitName,
      nameStatus(input.customerName, input.hitNames, input.legalForms, input.variantGroups),
    ),
    row(
      "dob",
      "Date of birth",
      input.customerDob,
      input.hitDobs.length ? input.hitDobs.join(", ") : null,
      dobStatus(input.customerDob, input.hitDobs),
    ),
    row(
      "country",
      "Country",
      joinKnown(input.customerCountries),
      joinKnown(input.hitCountries),
      countryStatus(input.customerCountries, input.hitCountries, input.canon),
    ),
  ];
}

export function cityRow(
  customerCity: string | null,
  hitCity: string | null,
): CompareDisplayRow | null {
  const customer = clean(customerCity);
  const hit = clean(hitCity);
  if (!customer && !hit) return null;
  return row("city", "City", customer, hit, cityStatus(customer, hit));
}

export function entityRow(customerType: string | null, hitType: string | null): CompareDisplayRow {
  return row("entity", "Entity type", customerType, hitType, entityStatus(customerType, hitType));
}

export function cityFromAddresses(addresses: readonly string[], isCountry: (value: string) => boolean): string | null {
  for (const address of addresses) {
    const withoutCode = address.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    if (!withoutCode || withoutCode.includes(",")) continue;
    if (isCountry(withoutCode)) continue;
    if (/^[\d\s-]+$/.test(withoutCode)) continue;
    return withoutCode;
  }
  return null;
}

export function nameStatus(
  customer: string | null,
  hitNames: readonly string[],
  legalForms: readonly string[],
  variantGroups: readonly (readonly string[])[],
): CompareStatus {
  const legal = new Set(legalForms.map((form) => form.toLowerCase()));
  const variants = variantIndex(variantGroups);
  const left = nameTokens(customer, legal, variants);
  const rights = hitNames.map((name) => nameTokens(name, legal, variants)).filter((tokens) => tokens.length > 0);
  if (left.length === 0 || rights.length === 0) return "Undefined";
  if (rights.some((tokens) => sameTokens(left, tokens))) return "Match";
  return "Different";
}

export function dobStatus(customer: string | null, hitDobs: readonly string[]): CompareStatus {
  const left = parseDate(customer);
  const right = hitDobs.map((value) => parseDate(value)).filter((value): value is PartialDate => value != null);
  if (!left || right.length === 0) return "Undefined";
  if (right.some((hit) => datesAgree(left, hit))) return "Match";
  if (right.every((hit) => datesContradict(left, hit))) return "Different";
  return "Undefined";
}

export function countryStatus(
  customerValues: readonly string[],
  hitValues: readonly string[],
  canon: (value: string) => string | null,
): CompareStatus {
  const left = unique(customerValues.map((value) => canon(value)).filter((value): value is string => Boolean(value)));
  const right = unique(hitValues.map((value) => canon(value)).filter((value): value is string => Boolean(value)));
  if (left.length === 0 || right.length === 0) return "Undefined";
  if (left.some((value) => right.includes(value))) return "Match";
  return "Different";
}

export function entityStatus(customer: string | null, hit: string | null): CompareStatus {
  const left = entityKind(customer);
  const right = entityKind(hit);
  if (!left || !right) return "Undefined";
  return left === right ? "Match" : "Different";
}

export function cityStatus(customer: string | null, hit: string | null): CompareStatus {
  if (!customer || !hit) return "Undefined";
  const left = foldPlace(customer);
  const right = foldPlace(hit);
  if (!left || !right) return "Undefined";
  if (left === right) return "Match";
  return "Different";
}

export function otherMatching(input: {
  hitId: string | null;
  aliases: readonly string[];
  evidenceIds: readonly string[];
  checks: ReadonlyMap<string, { verifiedName: string | null; verifiedDob: string | null; documentCountry: string | null; result: string | null }>;
  notes: ReadonlyMap<string, string>;
  searches: ReadonlyMap<string, { title: string | null; snippet: string | null }>;
  account: { id: string; customerId: string | null; present: boolean } | null;
}): OtherLine[] {
  const lines: OtherLine[] = [];
  const aliases = input.aliases.map((alias) => alias.trim()).filter(Boolean);
  if (input.hitId && aliases.length > 0) {
    lines.push({ id: input.hitId, label: "Aliases", line: oneLine(aliases.join(", ")) });
  }
  const seen = new Set<string>();
  for (const id of input.evidenceIds) {
    if (seen.has(id)) continue;
    const check = input.checks.get(id);
    if (!check) continue;
    seen.add(id);
    lines.push({
      id,
      label: "Identity check",
      line: oneLine(
        `Verified ${shown(check.verifiedName)}, ${shown(check.verifiedDob)}, document ${shown(check.documentCountry)}, ${shown(check.result)}`,
      ),
    });
  }
  for (const id of input.evidenceIds) {
    if (seen.has(id)) continue;
    const text = input.notes.get(id);
    if (!text) continue;
    seen.add(id);
    lines.push({ id, label: "Note", line: oneLine(text) });
  }
  for (const id of input.evidenceIds) {
    if (seen.has(id)) continue;
    const result = input.searches.get(id);
    if (!result) continue;
    seen.add(id);
    const text = [result.title, result.snippet].filter((part): part is string => Boolean(part && part.trim())).join(" — ");
    if (!text) continue;
    lines.push({ id, label: "Search result", line: oneLine(text) });
  }
  if (input.account) {
    const line = !input.account.present
      ? "This id is not in accounts.jsonl."
      : input.account.customerId
        ? `Links this alert to ${input.account.customerId}`
        : "Account link on this alert.";
    lines.push({ id: input.account.id, label: "Account", line });
  }
  return lines;
}

export function oneLine(value: string, max = 180): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function row(
  id: CompareDisplayRow["id"],
  label: string,
  customer: string | null,
  hit: string | null,
  status: CompareStatus,
): CompareDisplayRow {
  return {
    id,
    label,
    customer: shown(customer),
    hit: shown(hit),
    status,
  };
}

function shown(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text || /^not given$/i.test(text)) return NOT_GIVEN;
  return text;
}

function clean(value: string | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function joinKnown(values: readonly string[]): string | null {
  const kept = values.map((value) => value.trim()).filter(Boolean);
  return kept.length ? kept.join(", ") : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function foldPlace(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function variantIndex(groups: readonly (readonly string[])[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    const forms = group.map((name) => name.toLowerCase()).filter(Boolean);
    const canonical = forms[0];
    if (!canonical) continue;
    for (const form of forms) map.set(form, canonical);
  }
  return map;
}

function nameTokens(value: string | null, legal: ReadonlySet<string>, variants: ReadonlyMap<string, string>): string[] {
  if (!value) return [];
  const folded = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!folded) return [];
  const tokens: string[] = [];
  for (const token of folded.split(/\s+/)) {
    if (!token || token.length === 1 || legal.has(token)) continue;
    tokens.push(variants.get(token) ?? token);
  }
  return tokens.sort();
}

function sameTokens(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => token === right[index]);
}

function entityKind(value: string | null): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (key === "individual" || key === "person" || key === "natural person") return "person";
  if (key === "company" || key === "organisation" || key === "organization" || key === "business" || key === "corporate") {
    return "company";
  }
  return key;
}

export function parseDate(value: string | null | undefined): PartialDate | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || /^not given$/i.test(text)) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return partial(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) return partial(Number(match[1]), Number(match[2]), null);
  match = /^(\d{4})$/.exec(text);
  if (match) return partial(Number(match[1]), null, null);
  match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/i.exec(
    text,
  );
  if (match) return partial(Number(match[3]), MONTHS[match[1].toLowerCase()] ?? null, Number(match[2]));
  match = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/i.exec(
    text,
  );
  if (match) return partial(Number(match[3]), MONTHS[match[2].toLowerCase()] ?? null, Number(match[1]));
  match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/i.exec(text);
  if (match) return partial(Number(match[2]), MONTHS[match[1].toLowerCase()] ?? null, null);
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
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
