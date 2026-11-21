import type { Closeness, ClosenessBand, Comparison, ComparedFact, Decision, FactStatus } from "@/lib/types";

const STATUSES = new Set<FactStatus>(["match", "different", "undefined"]);

const POINTS = {
  name: { match: 40, undefined: 15, different: 0 },
  dateOfBirth: { match: 30, undefined: 10, different: 0 },
  country: { match: 30, undefined: 10, different: 0 },
} as const;

export function readComparison(value: unknown): Comparison | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = readFact(record.name);
  const dateOfBirth = readFact(record.date_of_birth);
  const country = readFact(record.country);
  if (!name || !dateOfBirth || !country) return null;
  return { name, dateOfBirth, country };
}

export function readCloseness(value: unknown, comparison: Comparison | null, decision: Decision): Closeness | null {
  if (decision === "DIFFERENT_ENTITY") return null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = point(record.name, POINTS.name);
  const dateOfBirth = point(record.date_of_birth, POINTS.dateOfBirth);
  const country = point(record.country, POINTS.country);
  const total = record.total;
  const band = record.band;
  if (name == null || dateOfBirth == null || country == null) return null;
  if (typeof total !== "number" || total !== name + dateOfBirth + country) return null;
  const expected = closenessBand(total);
  if (band !== expected) return null;
  if (comparison) {
    if (name !== POINTS.name[comparison.name.status]) return null;
    if (dateOfBirth !== POINTS.dateOfBirth[comparison.dateOfBirth.status]) return null;
    if (country !== POINTS.country[comparison.country.status]) return null;
  }
  return { total, band: expected, name, dateOfBirth, country };
}

export function closenessBand(total: number): ClosenessBand {
  if (total >= 80) return "Close";
  if (total >= 40) return "Partial";
  return "Distant";
}

function readFact(value: unknown): ComparedFact | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.customer !== "string" || typeof record.hit !== "string") return null;
  if (!STATUSES.has(record.status as FactStatus)) return null;
  return {
    customer: record.customer.trim() || "Not given",
    hit: record.hit.trim() || "Not given",
    status: record.status as FactStatus,
  };
}

function point(value: unknown, allowed: Record<FactStatus, number>): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (!Object.values(allowed).includes(value)) return null;
  return value;
}
