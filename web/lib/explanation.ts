import type { Closeness, Comparison, Decision, DeskCase, EvidenceRecord, ResultRow, ScreenedCustomer, WatchlistHit } from "./types";

/** The order grounds are listed. The stored reason_code is marked separately. */
export const GROUND_PRIORITY = [
  "ENTITY_TYPE_MISMATCH",
  "DECEASED",
  "TEMPORAL_IMPOSSIBILITY",
  "DOB_MISMATCH",
  "NAME_MISMATCH_VERIFIED",
  "LOCATION_MISMATCH",
  "NAME_DOB_LOCATION_MATCH",
  "NAME_DOB_MATCH",
  "NAME_LOCATION_MATCH",
  "INSUFFICIENT_DATA",
  "AMBIGUOUS_CUSTOMER_RECORD",
] as const;

export const UNCHECKED_GROUNDS = "Other grounds were not re-checked.";

export type Explanation = {
  source: "examples" | "row";
  key: string;
  hitId: string;
  alertId: string;
  customerName: string | null;
  listedName: string | null;
  decision: Decision;
  reasonCode: string;
  reason: string;
  customerRecordId: string | null;
  groundsChecked: boolean;
  applicableCodes: string[];
  customerMissing: boolean;
  customerNote: string | null;
  screened: ScreenedCustomer | null;
  hit: WatchlistHit | null;
  evidence: EvidenceRecord[] | null;
  evidenceIds: string[];
  evidenceNote: string;
  customerDob: string | null;
  customerCountry: string | null;
  comparison: Comparison | null;
  closeness: Closeness | null;
};

export function groundsToShow(stored: string, checked: boolean, applicable: readonly string[]): string[] {
  if (!checked) {
    return stored ? [stored] : [];
  }
  const known = new Set(applicable);
  const codes: string[] = GROUND_PRIORITY.filter((code) => known.has(code));
  for (const code of applicable) {
    if (!codes.includes(code)) codes.push(code);
  }
  if (stored && !codes.includes(stored)) codes.push(stored);
  return codes;
}

export function actionFor(decision: Decision, customerRecordId: string | null): string {
  if (decision === "DIFFERENT_ENTITY") {
    return "This hit can be cleared. The alert stays open until every hit on it is cleared.";
  }
  if (decision === "SAME_ENTITY") {
    return "This is the same person or company. Do not clear it.";
  }
  if (customerRecordId === "AMBIGUOUS") {
    return "Do not clear it. A person decides. The customer record is AMBIGUOUS.";
  }
  if (customerRecordId == null) {
    return "Do not clear it. A person decides. No customer id was resolved.";
  }
  return "Do not clear it. A person decides.";
}

export function customerFileMessage(customerRecordId: string | null, missing: boolean): string | null {
  if (!missing || !customerRecordId || customerRecordId === "AMBIGUOUS") return null;
  return `${customerRecordId} is not in customers.jsonl.`;
}

export function explainCase(item: DeskCase): Explanation {
  return {
    source: "examples",
    key: item.hitId,
    hitId: item.hitId,
    alertId: item.alertId,
    customerName: item.screened.name,
    listedName: item.hit.name,
    decision: item.resolution.decision,
    reasonCode: item.resolution.reason_code,
    reason: item.resolution.reason,
    customerRecordId: item.resolution.customer_record_id,
    groundsChecked: item.groundsChecked,
    applicableCodes: item.applicableCodes,
    customerMissing: item.customerMissing,
    customerNote: item.customerNote,
    screened: item.screened,
    hit: item.hit,
    evidence: item.evidence,
    evidenceIds: item.resolution.evidence,
    evidenceNote:
      "These records are read from the development data folder: the customer, the cited evidence, and the notes and checks joined for this hit.",
    customerDob: item.screened.dob,
    customerCountry: item.screened.country,
    comparison: item.resolution.comparison,
    closeness: item.resolution.closeness,
  };
}

export function explainRow(row: ResultRow, evidenceNote: string): Explanation {
  return {
    source: "row",
    key: `${row.hitId}:${row.alertId}:${row.reasonCode}`,
    hitId: row.hitId,
    alertId: row.alertId,
    customerName: row.name,
    listedName: row.listedName,
    decision: row.decision,
    reasonCode: row.reasonCode,
    reason: row.reason,
    customerRecordId: row.customerRecordId,
    groundsChecked: row.groundsChecked,
    applicableCodes: row.applicableCodes,
    customerMissing: row.customerMissing || row.customerInFile === false,
    customerNote: null,
    screened: null,
    hit: null,
    evidence: null,
    evidenceIds: row.evidence,
    evidenceNote,
    customerDob: row.customerDob,
    customerCountry: row.customerCountry,
    comparison: row.comparison,
    closeness: row.closeness,
  };
}
