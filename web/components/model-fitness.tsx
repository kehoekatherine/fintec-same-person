import { useMemo } from "react";

import { accuracyFigures, accuracyText } from "@/lib/model-fitness";
import { formatDecisionScore } from "@/lib/reviewer-cost";
import type { PracticeLabel, ResultRow } from "@/lib/types";

/**
 * The judging decision score, labeled as fitness, with accuracy beside it.
 * The score number comes from reviewer-cost. This does not calculate another one.
 */
export function ModelFitnessFigures({
  rows,
  labels,
  score,
  baseline,
}: {
  rows: ResultRow[];
  labels?: PracticeLabel[] | null;
  score: number | null;
  baseline: number | null;
}) {
  const figures = useMemo(() => accuracyFigures(rows, labels), [labels, rows]);
  const available = figures.labeledInRun > 0 && score != null && baseline != null && baseline > 0;
  return (
    <>
      <span data-testid="model-fitness" className="text-foreground" title={fitnessTitle(baseline, figures.labeledInRun)}>
        {available && score != null ? (
          <>
            Fitness{" "}
            <span className="font-medium tabular-nums" data-testid="reviewer-score">
              {formatDecisionScore(score)}
            </span>
          </>
        ) : (
          "Fitness unavailable"
        )}
      </span>
      <span aria-hidden="true">. </span>
      <span
        data-testid="model-accuracy"
        title="Labeled hits in this run whose decision matches the practice label. Clearance precision is predicted clears that are truly clear. Same-entity recall is true matches predicted as the same entity. A figure with no cases is unavailable."
      >
        {accuracyText(figures)}
      </span>
    </>
  );
}

function fitnessTitle(baseline: number | null, labeledInRun: number): string {
  if (labeledInRun <= 0) return "Fitness is unavailable because this run has no practice label.";
  if (baseline == null || baseline <= 0) {
    return "Fitness is unavailable because sending every labeled hit to review would cost nothing.";
  }
  return "Fitness is the judging decision score. It is 100 times the share of the review-all baseline this run saves.";
}
