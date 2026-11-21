"use client";

import { useMemo } from "react";

import { ModelFitnessFigures } from "@/components/model-fitness";
import { formatDecisionScore, reviewerReport } from "@/lib/reviewer-cost";
import type { PracticeLabel, ResultRow } from "@/lib/types";

const TITLE =
  "Judging cost uses the practice labels. Clearing a true different person costs 0, and confirming or reviewing that person costs 3. Clearing a true same person or a true review costs 60. Baseline is the cost of sending every labeled hit to review. Score is 100 times the share of that baseline this run saves, and it cannot go below 0. An unsafe clearance is a true same person or a true review that was cleared. Hits with no label are left out of that score. Reviewer workload counts REVIEW, DIFFERENT_ENTITY, and SAME_ENTITY on the whole run.";

export function ReviewerCostLine({ rows, labels }: { rows: ResultRow[]; labels?: PracticeLabel[] | null }) {
  const report = useMemo(() => reviewerReport(rows, labels), [labels, rows]);
  const judging = report.judging;
  const workload = report.workload;
  return (
    <p className="text-xs leading-4 text-muted-foreground" data-testid="reviewer-summary" title={TITLE}>
      {judging ? (
        <>
          <ModelFitnessFigures rows={rows} labels={labels} score={judging.score} baseline={judging.baseline} />
          . Judging cost{" "}
          <span className="font-medium text-foreground tabular-nums" data-testid="reviewer-cost">
            {judging.cost}
          </span>
          , baseline{" "}
          <span className="tabular-nums" data-testid="reviewer-baseline">
            {judging.baseline}
          </span>
          , score{" "}
          <span className="font-medium text-foreground tabular-nums" data-testid="reviewer-score">
            {formatDecisionScore(judging.score)}
          </span>
          . {count(judging.labeled, "labeled hit", "labeled hits")},{" "}
          {count(judging.unsafe, "unsafe clearance", "unsafe clearances")}, {withoutLabel(judging.unlabeled)}
          {judging.missingLabels > 0
            ? `. ${count(judging.missingLabels, "labeled hit is not in this run and counts as review", "labeled hits are not in this run and count as review")}`
            : ""}
          . Reviewer workload, not the judging score:{" "}
        </>
      ) : (
        <>No labels on this run, so this is reviewer workload, not a judging score. Reviewer workload: </>
      )}
      <span className="font-medium text-foreground tabular-nums" data-testid="reviewer-workload">
        {workload.review}
      </span>{" "}
      {workload.review === 1 ? "review" : "reviews"} to open, {workload.different} cleared, and {workload.same}{" "}
      confirmed.
    </p>
  );
}

function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function withoutLabel(value: number): string {
  return value === 1 ? "1 hit has no label" : `${value} hits have no label`;
}
