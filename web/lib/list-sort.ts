import { biasRiskForRow } from "./bias-risk.ts";
import { confidenceFor } from "./list-scores.ts";
import type { Decision, ResultRow } from "./types.ts";

export type SortKey =
  | "decision"
  | "closeness"
  | "bias"
  | "confidence"
  | "name"
  | "hit"
  | "alert"
  | "reasonCode"
  | "customer"
  | "reason";

export type SortDir = "asc" | "desc";

export type SortState = { key: SortKey; dir: SortDir };

const DECISION_RANK: Record<Decision, number> = {
  DIFFERENT_ENTITY: 0,
  REVIEW: 1,
  SAME_ENTITY: 2,
};

export function nextSort(current: SortState | null, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

export function sortRows(rows: ResultRow[], sort: SortState | null): ResultRow[] {
  if (!sort) return rows;
  const ranked = rows.map((row, index) => ({ row, index }));
  ranked.sort((left, right) => {
    const compared = compareRows(left.row, right.row, sort);
    if (compared !== 0) return compared;
    return left.index - right.index;
  });
  return ranked.map((item) => item.row);
}

function compareRows(left: ResultRow, right: ResultRow, sort: SortState): number {
  switch (sort.key) {
    case "decision":
      return directed(DECISION_RANK[left.decision] - DECISION_RANK[right.decision], sort.dir);
    case "closeness":
      return compareNumber(left.closeness?.total ?? null, right.closeness?.total ?? null, sort.dir);
    case "bias":
      return compareNumber(biasRiskForRow(left)?.total ?? null, biasRiskForRow(right)?.total ?? null, sort.dir);
    case "confidence":
      return directed(confidenceValue(left) - confidenceValue(right), sort.dir);
    case "name":
      return compareText(left.name ?? left.listedName ?? "", right.name ?? right.listedName ?? "", sort.dir);
    case "hit":
      return compareText(left.hitId, right.hitId, sort.dir);
    case "alert":
      return compareText(left.alertId, right.alertId, sort.dir);
    case "reasonCode":
      return compareText(left.reasonCode, right.reasonCode, sort.dir);
    case "customer":
      return compareText(left.customerRecordId ?? "", right.customerRecordId ?? "", sort.dir);
    case "reason":
      return compareText(left.reason, right.reason, sort.dir);
  }
}

function confidenceValue(row: ResultRow): number {
  return confidenceFor({
    decision: row.decision,
    reasonCode: row.reasonCode,
    closeness: row.closeness,
    bias: biasRiskForRow(row),
  }).total;
}

/** Missing numbers stay at the end in both directions. */
function compareNumber(left: number | null, right: number | null, dir: SortDir): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return directed(left - right, dir);
}

function compareText(left: string, right: string, dir: SortDir): number {
  const a = left.trim();
  const b = right.trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return directed(a.localeCompare(b, "en", { sensitivity: "base", numeric: true }), dir);
}

function directed(value: number, dir: SortDir): number {
  return dir === "asc" ? value : -value;
}
