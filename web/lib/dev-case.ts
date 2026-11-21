import { MISSING_DATA_FOLDER } from "@/lib/data-pack";
import { loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { fieldsOf, flattenAlert, stringOf, type Row } from "@/lib/record-fields";
import type { OpenedRecord, SourcedRecord } from "@/lib/types";

const NOT_IN_CUSTOMERS = "This id is not in customers.jsonl.";

export async function openDevelopmentRecord(input: {
  hitId: string | null;
  alertId: string | null;
  customerRecordId: string | null;
}): Promise<OpenedRecord> {
  const hitId = cleanId(input.hitId);
  const alertId = cleanId(input.alertId);
  const customerRecordId = cleanId(input.customerRecordId);
  const index = await loadPackIndex();
  return {
    hitId,
    alertId,
    customerRecordId,
    customer: customerRecord(index, customerRecordId),
    accounts: accountsFor(index, customerRecordId, alertId, hitId),
    notes: relatedNotes(index, customerRecordId),
    checks: relatedChecks(index, customerRecordId),
    hit: hitRecord(index, hitId),
    alert: alertRecord(index, alertId, hitId),
  };
}

function customerRecord(index: PackIndex | null, id: string | null): SourcedRecord | null {
  if (!id) return null;
  if (id === "AMBIGUOUS") {
    return {
      id,
      kind: "Customer record",
      file: "customers.jsonl",
      present: false,
      message: "More than one customer fits this alert. No single customer record is selected.",
      fields: [],
    };
  }
  if (!index) {
    return {
      id,
      kind: "Customer record",
      file: "customers.jsonl",
      present: false,
      message: MISSING_DATA_FOLDER,
      fields: [],
    };
  }
  const row = index.customers.get(id);
  if (!row) {
    return {
      id,
      kind: "Customer record",
      file: "customers.jsonl",
      present: false,
      message: NOT_IN_CUSTOMERS,
      fields: [],
    };
  }
  return {
    id,
    kind: "Customer record",
    file: "customers.jsonl",
    present: true,
    message: null,
    fields: fieldsOf(row, true),
  };
}

function hitRecord(index: PackIndex | null, hitId: string | null): SourcedRecord | null {
  if (!hitId) return null;
  if (!index) return missing("Watchlist hit", "hits.jsonl", hitId, "The development hits.jsonl is not on this machine.");
  const row = index.hits.get(hitId);
  if (!row) return missing("Watchlist hit", "hits.jsonl", hitId, "This id is not in hits.jsonl.");
  return { id: hitId, kind: "Watchlist hit", file: "hits.jsonl", present: true, message: null, fields: fieldsOf(row) };
}

function alertRecord(index: PackIndex | null, alertId: string | null, hitId: string | null): SourcedRecord | null {
  const id = resolveAlertId(index, alertId, hitId);
  if (!id) return null;
  if (!index) return missing("Alert", "alerts.jsonl", id, "The development alerts.jsonl is not on this machine.");
  const row = index.alerts.get(id);
  if (!row) return missing("Alert", "alerts.jsonl", id, "This id is not in alerts.jsonl.");
  return {
    id,
    kind: "Alert",
    file: "alerts.jsonl",
    present: true,
    message: null,
    fields: fieldsOf(flattenAlert(row)),
  };
}

function relatedNotes(index: PackIndex | null, customerId: string | null): SourcedRecord[] {
  if (!index || !customerId || customerId === "AMBIGUOUS" || !index.customers.has(customerId)) return [];
  const email = stringOf(index.customers.get(customerId)?.email)?.toLowerCase();
  if (!email) return [];
  return (index.notesByEmail.get(email) ?? []).flatMap((row) => {
    const id = stringOf(row.note_id);
    if (!id) return [];
    return [{ id, kind: "Note", file: "notes.jsonl", present: true, message: null, fields: fieldsOf(row) }];
  });
}

function relatedChecks(index: PackIndex | null, customerId: string | null): SourcedRecord[] {
  if (!index || !customerId || customerId === "AMBIGUOUS" || !index.customers.has(customerId)) return [];
  const records: SourcedRecord[] = [];
  const seen = new Set<string>();
  for (const applicant of index.applicantsByCustomer.get(customerId) ?? []) {
    for (const row of index.checksByApplicant.get(applicant) ?? []) {
      const id = stringOf(row.check_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push({
        id,
        kind: "Identity check",
        file: "kyc_checks.jsonl",
        present: true,
        message: null,
        fields: fieldsOf(row),
      });
    }
  }
  return records;
}

function accountsFor(
  index: PackIndex | null,
  customerId: string | null,
  alertId: string | null,
  hitId: string | null,
): SourcedRecord[] {
  if (!index) return [];
  const records: SourcedRecord[] = [];
  const seen = new Set<string>();
  if (customerId && customerId !== "AMBIGUOUS" && index.customers.has(customerId)) {
    for (const row of index.accountsByCustomer.get(customerId) ?? []) pushAccount(records, seen, row);
  }
  const alert = alertRow(index, alertId, hitId);
  const accountRef = stringOf(alert?.account_ref);
  if (accountRef && !seen.has(accountRef)) {
    const row = index.accountsById.get(accountRef);
    if (row) pushAccount(records, seen, row);
    else records.push(missing("Account", "accounts.jsonl", accountRef, "This id is not in accounts.jsonl."));
  }
  return records;
}

function pushAccount(records: SourcedRecord[], seen: Set<string>, row: Row) {
  const id = stringOf(row.account_id);
  if (!id || seen.has(id)) return;
  seen.add(id);
  records.push({ id, kind: "Account", file: "accounts.jsonl", present: true, message: null, fields: fieldsOf(row) });
}

function alertRow(index: PackIndex, alertId: string | null, hitId: string | null): Row | undefined {
  const id = resolveAlertId(index, alertId, hitId);
  return id ? index.alerts.get(id) : undefined;
}

function resolveAlertId(index: PackIndex | null, alertId: string | null, hitId: string | null): string | null {
  if (alertId) return alertId;
  if (!index || !hitId) return null;
  return stringOf(index.hits.get(hitId)?.alert_id);
}

function missing(kind: string, file: string, id: string, message: string): SourcedRecord {
  return { id, kind, file, present: false, message, fields: [] };
}

function cleanId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
