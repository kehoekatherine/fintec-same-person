export type Decision = "DIFFERENT_ENTITY" | "SAME_ENTITY" | "REVIEW";

export type FilterId = "all" | "clear" | "confirm" | "review";

export type Resolution = {
  hit_id: string;
  alert_id: string;
  decision: Decision;
  reason_code: string;
  customer_record_id: string | null;
  reason: string;
  evidence: string[];
};

export type FieldRow = {
  label: string;
  value: string;
};

export type EvidenceRecord = {
  id: string;
  kind: string;
  file: string;
  fields: FieldRow[];
  note?: string | null;
};

export type ScreenedCustomer = {
  name: string;
  entityType: string | null;
  dob: string | null;
  country: string | null;
  city: string | null;
  screenedAt: string | null;
  accountRef: string | null;
};

export type WatchlistHit = {
  name: string;
  aliases: string[];
  entityType: string | null;
  dobs: string[];
  placeOfBirth: string | null;
  countries: string[];
  nationality: string[];
  category: string | null;
  allegation: string | null;
  notes: string | null;
  matchScore: number | null;
};

export type DeskCase = {
  hitId: string;
  alertId: string;
  screened: ScreenedCustomer;
  hit: WatchlistHit;
  resolution: Resolution;
  evidence: EvidenceRecord[];
};

export type DeskPayload = {
  source: "engine" | "snapshot";
  notice: string;
  ranAt: string;
  cases: DeskCase[];
};

export type QueueId = "dev" | "brief" | "upload";

export type ResultRow = {
  hitId: string;
  alertId: string;
  decision: Decision;
  reasonCode: string;
  customerRecordId: string | null;
  reason: string;
  evidence: string[];
  name: string | null;
  listedName: string | null;
  customerDob: string | null;
  customerCountry: string | null;
};

export type ResultPayload = {
  source: "development" | "upload";
  mode?: "recorded" | "scored";
  filename?: string;
  notice: string;
  rows: ResultRow[];
};

export type DeskFailure = {
  error: string;
  detail?: string;
};
