import { readFile } from "node:fs/promises";
import path from "node:path";

import { MISSING_DATA_FOLDER } from "@/lib/data-pack";
import { loadResolutions } from "@/lib/dev-run";
import { DeskError } from "@/lib/errors";
import { loadApplicableCodes } from "@/lib/grounds";
import { loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { fieldsOf, stringOf, type Row } from "@/lib/record-fields";
import type { DeskCase, DeskPayload, EvidenceRecord, Resolution, ScreenedCustomer, WatchlistHit } from "@/lib/types";

type PracticeLabel = {
  hitId: string;
  alertId: string;
  customerIds: string[];
};

export async function loadExamples(): Promise<DeskPayload> {
  const index = await loadPackIndex();
  if (!index) throw new DeskError(MISSING_DATA_FOLDER, { status: 404 });
  const labels = await readPracticeLabels(index.dir);
  const [{ rows, fresh }, codes] = await Promise.all([
    loadResolutions(),
    loadApplicableCodes(index.dir, 120_000),
  ]);
  const byHit = new Map(rows.map((row) => [row.hit_id, row]));
  const cases: DeskCase[] = [];
  for (const label of labels) {
    const resolution = byHit.get(label.hitId);
    if (!resolution) continue;
    const hit = index.hits.get(label.hitId);
    const alert = index.alerts.get(resolution.alert_id) ?? index.alerts.get(label.alertId);
    cases.push(buildCase(index, resolution, hit, alert, label, codes?.get(label.hitId)));
  }
  return {
    source: fresh ? "engine" : "snapshot",
    notice: fresh
      ? "Practice examples from the development data folder. These hits are the practice-label set, joined to that folder's customers, hits, alerts, notes, and checks."
      : "Practice examples from the development data folder. The Python resolver is not available, so the decisions are the recorded output. The records are still read from that folder.",
    ranAt: new Date().toISOString(),
    cases,
  };
}

async function readPracticeLabels(dir: string): Promise<PracticeLabel[]> {
  let text: string;
  try {
    text = await readFile(path.join(dir, "practice_labels.jsonl"), "utf8");
  } catch {
    throw new DeskError("The data folder has no practice_labels.jsonl, so the examples cannot be opened.", {
      status: 404,
    });
  }
  const labels: PracticeLabel[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Row;
    const hitId = stringOf(row.hit_id);
    if (!hitId) continue;
    const customerIds = Array.isArray(row.customer_record_ids)
      ? row.customer_record_ids.filter((id): id is string => typeof id === "string" && id.trim() !== "" && id !== "AMBIGUOUS")
      : [];
    labels.push({
      hitId,
      alertId: stringOf(row.alert_id) ?? "",
      customerIds,
    });
  }
  return labels;
}

function buildCase(
  index: PackIndex,
  resolution: Resolution,
  hit: Row | undefined,
  alert: Row | undefined,
  label: PracticeLabel,
  applicable: string[] | undefined,
): DeskCase {
  const customerId = resolution.customer_record_id;
  return {
    hitId: resolution.hit_id,
    alertId: resolution.alert_id,
    screened: screenedFrom(alert),
    hit: hitFrom(hit),
    resolution,
    evidence: evidenceFor(index, resolution, label),
    customerNote: customerNote(index, customerId),
    groundsChecked: applicable != null,
    applicableCodes: applicable ?? [],
    customerMissing: Boolean(customerId && customerId !== "AMBIGUOUS" && !index.customers.has(customerId)),
  };
}

function customerNote(index: PackIndex, id: string | null): string {
  if (!id) return "No customer record was resolved from the development folder.";
  if (id === "AMBIGUOUS") return "More than one customer fits this alert. No single customer record is selected.";
  if (!index.customers.has(id)) return `${id} is not in customers.jsonl.`;
  return "This customer is a row in the development customers.jsonl.";
}

function evidenceFor(index: PackIndex, resolution: Resolution, label: PracticeLabel): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  const seen = new Set<string>();
  const customerIds = unique([
    ...(resolution.customer_record_id && resolution.customer_record_id !== "AMBIGUOUS"
      ? [resolution.customer_record_id]
      : []),
    ...label.customerIds,
  ]);
  for (const id of customerIds) {
    push(records, seen, customerEvidence(index, id, id === resolution.customer_record_id));
  }
  for (const id of resolution.evidence) {
    if (seen.has(id)) continue;
    push(records, seen, citedEvidence(index, id));
  }
  for (const id of customerIds) {
    if (!index.customers.has(id)) continue;
    for (const note of notesForCustomer(index, id)) {
      const noteId = stringOf(note.note_id);
      if (!noteId || seen.has(noteId)) continue;
      push(records, seen, {
        id: noteId,
        kind: "Note",
        file: "notes.jsonl",
        note: "Joined from the development folder for this customer.",
        fields: fieldsOf(note),
      });
    }
    for (const check of checksForCustomer(index, id)) {
      const checkId = stringOf(check.check_id);
      if (!checkId || seen.has(checkId)) continue;
      push(records, seen, {
        id: checkId,
        kind: "Identity check",
        file: "kyc_checks.jsonl",
        note: "Joined from the development folder for this customer.",
        fields: fieldsOf(check),
      });
    }
  }
  return records;
}

function customerEvidence(index: PackIndex, id: string, resolved: boolean): EvidenceRecord {
  const row = index.customers.get(id);
  if (!row) {
    return {
      id,
      kind: "Customer record",
      file: "customers.jsonl",
      note: `${id} is not in customers.jsonl.`,
      fields: [],
    };
  }
  return {
    id,
    kind: "Customer record",
    file: "customers.jsonl",
    note: resolved ? null : "Listed for this hit in practice_labels.jsonl.",
    fields: fieldsOf(row, true),
  };
}

function citedEvidence(index: PackIndex, id: string): EvidenceRecord {
  const found = lookup(index, id);
  if (!found) {
    return {
      id,
      kind: "Missing record",
      file: "not in the development folder",
      note: "This id is cited, but it is not in the development files.",
      fields: [],
    };
  }
  return { id, kind: found.kind, file: found.file, note: null, fields: fieldsOf(found.row, found.kind === "Customer record") };
}

function lookup(index: PackIndex, id: string): { kind: string; file: string; row: Row } | null {
  const customer = index.customers.get(id);
  if (customer) return { kind: "Customer record", file: "customers.jsonl", row: customer };
  const note = index.notes.get(id);
  if (note) return { kind: "Note", file: "notes.jsonl", row: note };
  const check = index.checks.get(id);
  if (check) return { kind: "Identity check", file: "kyc_checks.jsonl", row: check };
  const search = index.searches.get(id);
  if (search) return { kind: "Search result", file: "search_results.jsonl", row: search };
  const account = index.accountsById.get(id);
  if (account) return { kind: "Account", file: "accounts.jsonl", row: account };
  const hit = index.hits.get(id);
  if (hit) return { kind: "Watchlist hit", file: "hits.jsonl", row: hit };
  const alert = index.alerts.get(id);
  if (alert) return { kind: "Alert", file: "alerts.jsonl", row: alert };
  return null;
}

function notesForCustomer(index: PackIndex, customerId: string): Row[] {
  const email = stringOf(index.customers.get(customerId)?.email)?.toLowerCase();
  if (!email) return [];
  return index.notesByEmail.get(email) ?? [];
}

function checksForCustomer(index: PackIndex, customerId: string): Row[] {
  const rows: Row[] = [];
  for (const applicant of index.applicantsByCustomer.get(customerId) ?? []) {
    rows.push(...(index.checksByApplicant.get(applicant) ?? []));
  }
  return rows;
}

function screenedFrom(alert: Row | undefined): ScreenedCustomer {
  const customer = (alert?.customer ?? {}) as Row;
  return {
    name: stringOf(customer.name) ?? "Unknown screened name",
    entityType: stringOf(customer.entity_type),
    dob: stringOf(customer.dob),
    country: stringOf(customer.country),
    city: stringOf(customer.city),
    screenedAt: stringOf(alert?.screened_at),
    accountRef: stringOf(alert?.account_ref),
  };
}

function hitFrom(hit: Row | undefined): WatchlistHit {
  return {
    name: stringOf(hit?.name) ?? "Unknown listed name",
    aliases: stringList(hit?.aliases),
    entityType: stringOf(hit?.entity_type),
    dobs: stringList(hit?.dobs),
    placeOfBirth: stringOf(hit?.place_of_birth),
    countries: stringList(hit?.countries),
    nationality: stringList(hit?.nationality),
    category: stringOf(hit?.primary_category) ?? stringList(hit?.categories)[0] ?? null,
    allegation: stringOf(hit?.position_or_allegation),
    notes: stringOf(hit?.profile_notes),
    matchScore: typeof hit?.match_score === "number" ? hit.match_score : null,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function push(records: EvidenceRecord[], seen: Set<string>, record: EvidenceRecord) {
  if (seen.has(record.id)) return;
  seen.add(record.id);
  records.push(record);
}
