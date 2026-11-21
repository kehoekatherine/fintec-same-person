export type Decision = "DIFFERENT_ENTITY" | "SAME_ENTITY" | "REVIEW";

export type FilterId = "all" | "clear" | "confirm" | "review";

export type FactStatus = "match" | "different" | "undefined";

export type ComparedFact = {
  customer: string;
  hit: string;
  status: FactStatus;
};

export type Comparison = {
  name: ComparedFact;
  dateOfBirth: ComparedFact;
  country: ComparedFact;
};

export type ClosenessBand = "Close" | "Partial" | "Distant";

export type Closeness = {
  total: number;
  band: ClosenessBand;
  name: number;
  dateOfBirth: number;
  country: number;
};

export type Resolution = {
  hit_id: string;
  alert_id: string;
  decision: Decision;
  reason_code: string;
  customer_record_id: string | null;
  reason: string;
  evidence: string[];
  comparison: Comparison | null;
  closeness: Closeness | null;
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

export type SourcedRecord = {
  id: string;
  kind: string;
  file: string;
  present: boolean;
  message: string | null;
  fields: FieldRow[];
};

export type OpenedRecord = {
  hitId: string | null;
  alertId: string | null;
  customerRecordId: string | null;
  customer: SourcedRecord | null;
  accounts: SourcedRecord[];
  notes: SourcedRecord[];
  checks: SourcedRecord[];
  hit: SourcedRecord | null;
  alert: SourcedRecord | null;
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
  customerNote: string;
  groundsChecked: boolean;
  applicableCodes: string[];
  customerMissing: boolean;
};

export type DeskPayload = {
  source: "engine" | "snapshot";
  notice: string;
  ranAt: string;
  cases: DeskCase[];
};

export type QueueId = "dev" | "upload";

/** A practice-label decision. Only the fields the judging matrix needs. */
export type PracticeLabel = {
  hitId: string;
  decision: Decision;
};

export type ResultRow = {
  hitId: string;
  alertId: string;
  decision: Decision;
  reasonCode: string;
  customerRecordId: string | null;
  /** True when this id is a row in the development customers.jsonl. False when that file was checked and the id is absent. */
  customerInFile: boolean | null;
  reason: string;
  evidence: string[];
  comparison: Comparison | null;
  closeness: Closeness | null;
  name: string | null;
  listedName: string | null;
  customerDob: string | null;
  customerCountry: string | null;
  groundsChecked: boolean;
  applicableCodes: string[];
  customerMissing: boolean;
};

export type ModelCount = {
  correct: number;
  total: number;
};

/**
 * Decision score and accuracy for hits that have a practice label.
 * A null fitness or ratio means that figure is unavailable.
 */
export type ModelFitness = {
  labelsRead: boolean;
  fitness: number | null;
  cost: number;
  baseline: number;
  accuracy: ModelCount | null;
  clearancePrecision: ModelCount | null;
  sameEntityRecall: ModelCount | null;
  labeled: number;
  unlabeled: number;
  hits: number;
};

export type ResultPayload = {
  source: "development" | "upload";
  mode?: "recorded" | "scored";
  filename?: string;
  notice: string;
  rows: ResultRow[];
  model?: ModelFitness;
  /** Practice labels for the development run, when this machine has them. */
  labels?: PracticeLabel[];
};

export type DeskFailure = {
  error: string;
  detail?: string;
};
