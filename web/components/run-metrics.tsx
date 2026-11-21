"use client";

import { useMemo } from "react";

import {
  accuracyText,
  costText,
  customerValueText,
  fitnessText,
  overfitText,
  runMetrics,
  savingsText,
  workloadText,
} from "@/lib/run-metrics";
import type { PracticeLabel, ResultRow } from "@/lib/types";

const TITLE =
  "Fitness, accuracy, cost, and savings use only this run's labels. Fitness is 100 times the share of the review-everything baseline this run saves, and it is unavailable when there are no labels or that baseline is 0. Savings, and the customer value, are that baseline minus the matrix cost. An unsafe clearance costs 60 inside the matrix, so it is not subtracted again. Overfitting is measured only when the folder has a practice label file and a separate held-out label file. Workload counts REVIEW, DIFFERENT_ENTITY, and SAME_ENTITY on the whole run, and it is not the judging score.";

export function RunMetricsLine({
  rows,
  labels,
  heldOutLabels,
}: {
  rows: ResultRow[];
  labels?: PracticeLabel[] | null;
  heldOutLabels?: PracticeLabel[] | null;
}) {
  const metrics = useMemo(() => runMetrics(rows, labels, heldOutLabels), [heldOutLabels, labels, rows]);
  return (
    <div className="mb-2 text-sm leading-5 text-muted-foreground" data-testid="run-metrics" title={TITLE}>
      <p>
        <span data-testid="model-fitness" className="text-foreground">
          {fitnessText(metrics)}
        </span>
        <span aria-hidden="true"> · </span>
        <span data-testid="model-accuracy">{accuracyText(metrics)}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="model-overfit">{overfitText(metrics)}</span>
      </p>
      <p>
        <span data-testid="run-cost" className="text-foreground">
          {costText(metrics)}
        </span>
        <span aria-hidden="true"> · </span>
        <span data-testid="run-savings">{savingsText(metrics)}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="customer-value">{customerValueText(metrics)}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="run-workload">{workloadText(metrics)}</span>
      </p>
    </div>
  );
}
