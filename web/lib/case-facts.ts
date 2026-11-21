import { COUNTRY_ALIAS, NOT_COUNTRIES, countryKeys, foldText } from "@/lib/countries";
import {
  cityFromAddresses,
  cityRow,
  coreRows,
  CUSTOMER_FILE_ABSENT,
  customerAbsenceMessage,
  entityRow,
  otherMatching,
  type CaseFacts,
} from "@/lib/compare-rows";
import { loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { stringOf, type Row } from "@/lib/record-fields";

export type { CaseFacts } from "@/lib/compare-rows";

const EMPTY: CaseFacts = {
  packPresent: false,
  hitPresent: false,
  customerInFile: null,
  customerMessage: CUSTOMER_FILE_ABSENT,
  core: [],
  city: null,
  entity: null,
  others: [],
};

export async function loadCaseFacts(input: {
  hitId: string | null;
  alertId: string | null;
  customerRecordId: string | null;
  evidenceIds: string[];
}): Promise<CaseFacts> {
  const index = await loadPackIndex();
  if (!index) return EMPTY;
  return factsFromIndex(index, input);
}

export function factsFromIndex(
  index: PackIndex,
  input: {
    hitId: string | null;
    alertId: string | null;
    customerRecordId: string | null;
    evidenceIds: string[];
  },
): CaseFacts {
  const hitId = input.hitId;
  const customerId = input.customerRecordId;
  const hit = hitId ? index.hits.get(hitId) : undefined;
  const customerInFile = customerId && customerId !== "AMBIGUOUS" ? index.customers.has(customerId) : null;
  const customer = customerInFile && customerId ? index.customers.get(customerId) : undefined;
  const alert = alertRow(index, input.alertId, hit);
  const evidenceIds = input.evidenceIds.filter((id) => /^[A-Za-z0-9_-]+$/.test(id) && id.length <= 80);
  const customerCountries = customer
    ? [stringOf(customer.residence_country), stringOf(customer.nationality)].filter((value): value is string => Boolean(value))
    : [];
  const hitCountries = hit ? [...strings(hit.countries), ...strings(hit.nationality)] : [];
  const hitNames = hit ? [stringOf(hit.name), ...strings(hit.aliases)].filter((value): value is string => Boolean(value)) : [];
  const core = coreRows({
    customerName: customer ? stringOf(customer.full_name) : null,
    hitNames,
    customerDob: customer ? stringOf(customer.dob) : null,
    hitDobs: hit ? strings(hit.dobs) : [],
    customerCountries,
    hitCountries,
    legalForms: index.variants.legalForms,
    variantGroups: index.variants.groups,
    canon: (value) => countryKeys(value)[0] ?? null,
  });
  const hitCity = hit ? cityFromAddresses(strings(hit.addresses), isKnownCountry) : null;
  return {
    packPresent: true,
    hitPresent: Boolean(hit),
    customerInFile,
    customerMessage: customerAbsenceMessage(customerId, customerInFile),
    core: hit || customer ? core : [],
    city: cityRow(customer ? stringOf(customer.city) : null, hitCity),
    entity: entityRow(customer ? stringOf(customer.entity_type) : null, hit ? stringOf(hit.entity_type) : null),
    others: otherMatching({
      hitId,
      aliases: hit ? strings(hit.aliases) : [],
      evidenceIds,
      checks: checksFor(index, evidenceIds),
      notes: notesFor(index, evidenceIds),
      searches: searchesFor(index, evidenceIds),
      account: accountLink(index, alert),
    }),
  };
}

function alertRow(index: PackIndex, alertId: string | null, hit: Row | undefined): Row | undefined {
  if (alertId && index.alerts.has(alertId)) return index.alerts.get(alertId);
  const fromHit = stringOf(hit?.alert_id);
  return fromHit ? index.alerts.get(fromHit) : undefined;
}

function accountLink(index: PackIndex, alert: Row | undefined): { id: string; customerId: string | null; present: boolean } | null {
  const id = stringOf(alert?.account_ref);
  if (!id) return null;
  const account = index.accountsById.get(id);
  if (!account) return { id, customerId: null, present: false };
  return { id, customerId: stringOf(account.customer_id), present: true };
}

function checksFor(index: PackIndex, evidenceIds: readonly string[]) {
  const map = new Map<string, { verifiedName: string | null; verifiedDob: string | null; documentCountry: string | null; result: string | null }>();
  for (const id of evidenceIds) {
    const row = index.checks.get(id);
    if (!row) continue;
    map.set(id, {
      verifiedName: stringOf(row.verified_name),
      verifiedDob: stringOf(row.verified_dob),
      documentCountry: stringOf(row.document_country),
      result: stringOf(row.result),
    });
  }
  return map;
}

function notesFor(index: PackIndex, evidenceIds: readonly string[]) {
  const map = new Map<string, string>();
  for (const id of evidenceIds) {
    const text = stringOf(index.notes.get(id)?.text);
    if (text) map.set(id, text);
  }
  return map;
}

function searchesFor(index: PackIndex, evidenceIds: readonly string[]) {
  const map = new Map<string, { title: string | null; snippet: string | null }>();
  for (const id of evidenceIds) {
    const row = index.searches.get(id);
    if (!row) continue;
    map.set(id, { title: stringOf(row.title), snippet: stringOf(row.snippet) });
  }
  return map;
}

function isKnownCountry(value: string): boolean {
  const key = foldText(value.replace(/\[[^\]]*\]/g, " "));
  if (!key || NOT_COUNTRIES.has(key)) return false;
  return Boolean(COUNTRY_ALIAS[key]);
}

function strings(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}
