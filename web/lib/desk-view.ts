export type DeskView = "queue" | "analysis" | "cost";

export type CostSection = "models" | "classical" | "risk";

/** `?view=analysis` is the case page. `?view=case` is the same address. */
export function deskView(value: string | null): DeskView {
  if (value === "analysis" || value === "case") return "analysis";
  if (value === "cost") return "cost";
  return "queue";
}

/** `?section=classical` and `?section=ml` open the same cost section. */
export function costSection(value: string | null): CostSection {
  if (value === "classical" || value === "ml") return "classical";
  if (value === "risk") return "risk";
  return "models";
}
