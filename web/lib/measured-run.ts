export type ReasonCodeCount = {
  code: string;
  count: number;
};

export type MeasuredDecisions = {
  different: number;
  same: number;
  review: number;
};

export type StatusCounts = {
  match: number;
  different: number;
  undefined: number;
};

/** Stored field statuses on the recorded pairs. Not a linkage run and not a label score. */
export type PairFeatures = {
  pairs: number;
  note: string;
  name: StatusCounts;
  dateOfBirth: StatusCounts;
  country: StatusCounts;
  fieldsAgreeing: { agree: number; count: number }[];
};

/** Counts taken from output/dev.jsonl. Nulls are facts this repository does not have. */
export type MeasuredRun = {
  hits: number;
  method: string;
  charsMean: number;
  charsP50: number;
  charsP90: number;
  reasonCharsMean: number;
  inputTokensMean: number;
  inputTokensP50: number;
  inputTokensP90: number;
  reasonTokensMean: number;
  reasonTokensP50: number;
  decisions: MeasuredDecisions;
  reasonCodes: ReasonCodeCount[];
  resolverSeconds: null;
  labelsPresent: false;
  pairFeatures?: PairFeatures;
};

export function isMeasuredRun(value: unknown): value is MeasuredRun {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hits === "number" &&
    typeof record.inputTokensMean === "number" &&
    typeof record.reasonTokensMean === "number" &&
    record.labelsPresent === false &&
    record.resolverSeconds === null &&
    !!record.decisions &&
    typeof record.decisions === "object"
  );
}
