import type { Decision, FilterId, ResultRow } from "@/lib/types";
import { FILTERS } from "@/lib/labels";

export function filterResults(rows: ResultRow[], query: string, filter: FilterId) {
  const needle = query.trim().toLowerCase();
  const searched = needle
    ? rows.filter((row) =>
        [row.hitId, row.alertId, row.customerRecordId, row.name, row.listedName, row.reasonCode, row.reason]
          .join("\n")
          .toLowerCase()
          .includes(needle),
      )
    : rows;
  const counts: Record<FilterId, number> = {
    all: searched.length,
    clear: 0,
    confirm: 0,
    review: 0,
  };
  for (const row of searched) {
    counts[countKey(row.decision)] += 1;
  }
  const selected = FILTERS.find((item) => item.id === filter);
  const filtered = selected?.decision
    ? searched.filter((row) => row.decision === selected.decision)
    : searched;
  return { counts, filtered };
}

function countKey(decision: Decision): Exclude<FilterId, "all"> {
  if (decision === "DIFFERENT_ENTITY") return "clear";
  if (decision === "SAME_ENTITY") return "confirm";
  return "review";
}
