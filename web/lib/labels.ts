import type { Decision, FilterId } from "@/lib/types";

export const DECISION_LABEL: Record<Decision, string> = {
  DIFFERENT_ENTITY: "Clear",
  SAME_ENTITY: "Confirm",
  REVIEW: "Review",
};

export const DECISION_MEANING: Record<Decision, string> = {
  DIFFERENT_ENTITY: "Different person. The hit is cleared.",
  SAME_ENTITY: "Same person. The hit is confirmed.",
  REVIEW: "Not enough to decide. A person should look.",
};

export const REASON_LABEL: Record<string, string> = {
  ENTITY_TYPE_MISMATCH: "A person and a company",
  DECEASED: "Died before the screen",
  TEMPORAL_IMPOSSIBILITY: "Too young at the dated report",
  DOB_MISMATCH: "Dates of birth contradict",
  NAME_MISMATCH_VERIFIED: "Verified name does not match",
  LOCATION_MISMATCH: "Countries do not overlap",
  NAME_DOB_LOCATION_MATCH: "Name, year, and country agree",
  NAME_DOB_MATCH: "Name and year agree",
  NAME_LOCATION_MATCH: "Company name and country agree",
  INSUFFICIENT_DATA: "Not enough to decide",
  AMBIGUOUS_CUSTOMER_RECORD: "More than one customer fits",
};

export const FILTERS: { id: FilterId; label: string; decision: Decision | null }[] = [
  { id: "all", label: "All", decision: null },
  { id: "clear", label: "Clear", decision: "DIFFERENT_ENTITY" },
  { id: "confirm", label: "Confirm", decision: "SAME_ENTITY" },
  { id: "review", label: "Review", decision: "REVIEW" },
];

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? code;
}
