export type DeskView = "about" | "analysis" | "cost";

export type CostSection = "models" | "risk";

/**
 * No `view` opens About. `?hit=` with no view opens case analysis.
 * `?view=queue` is the old queue address: a hit goes to analysis, otherwise About.
 */
export function deskView(value: string | null, hit: string | null = null): DeskView {
  if (value === "analysis" || value === "case") return "analysis";
  if (value === "queue") return hit ? "analysis" : "about";
  if (value === "cost") return "cost";
  if (value === "about" || value === "summary") return "about";
  if (hit) return "analysis";
  return "about";
}

/** `?section=classical` and `?section=ml` have no page. They use the language-model section. */
export function costSection(value: string | null): CostSection {
  if (value === "risk") return "risk";
  return "models";
}

export function legacyAddress(view: string | null, section: string | null, hit: string | null): Record<string, string | null> | null {
  if (view === "queue") {
    return hit ? { view: "analysis" } : { view: null, hit: null, section: null };
  }
  if ((view === null || view === "") && hit) return { view: "analysis" };
  if (section === "classical" || section === "ml") return { section: null };
  return null;
}
