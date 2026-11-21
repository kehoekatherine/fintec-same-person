import type { Decision, PracticeLabel } from "./types.ts";

/**
 * Judging matrix from validate.py.
 * The outer key is the true label. The inner key is the prediction.
 * A missing prediction is scored as REVIEW, the same way validate.py does.
 */
export const DECISION_COST: Record<Decision, Record<Decision, number>> = {
  DIFFERENT_ENTITY: { DIFFERENT_ENTITY: 0, SAME_ENTITY: 3, REVIEW: 3 },
  SAME_ENTITY: { DIFFERENT_ENTITY: 60, SAME_ENTITY: 0, REVIEW: 2 },
  REVIEW: { DIFFERENT_ENTITY: 60, SAME_ENTITY: 2, REVIEW: 0 },
};

export type Workload = {
  review: number;
  different: number;
  same: number;
};

/** Matrix figures for one label file. Null when that file has no labels. */
export type LabelScore = {
  cost: number;
  baseline: number;
  /** baseline - cost. The unsafe-clearance cost of 60 is already inside cost. */
  savings: number;
  /** 100 * max(0, 1 - cost / baseline). Null when the baseline is 0. */
  fitness: number | null;
  correct: number;
  labeled: number;
  /** True SAME or true REVIEW predicted DIFFERENT. */
  unsafe: number;
};

export type OverfitReport = {
  measured: boolean;
  /** True only when a held-out fitness number is lower than the development fitness. */
  overfit: boolean;
  developmentFitness: number | null;
  heldOutFitness: number | null;
  /** Development fitness minus held-out fitness, when both numbers exist. */
  gap: number | null;
};

export type RunMetrics = {
  workload: Workload;
  /** The run's own labels. Null when this run has no label file. */
  labeled: LabelScore | null;
  overfit: OverfitReport;
};

const UNMEASURED: OverfitReport = {
  measured: false,
  overfit: false,
  developmentFitness: null,
  heldOutFitness: null,
  gap: null,
};

export function scoreLabels(
  rows: readonly { hitId: string; decision: Decision }[],
  labels: readonly PracticeLabel[] | null | undefined,
): LabelScore | null {
  if (!labels || labels.length === 0) return null;
  const predicted = new Map<string, Decision>();
  for (const row of rows) {
    if (!row.hitId || predicted.has(row.hitId)) continue;
    predicted.set(row.hitId, row.decision);
  }
  const seen = new Set<string>();
  let cost = 0;
  let baseline = 0;
  let correct = 0;
  let labeled = 0;
  let unsafe = 0;
  for (const label of labels) {
    if (!label.hitId || seen.has(label.hitId)) continue;
    seen.add(label.hitId);
    labeled += 1;
    const known = predicted.get(label.hitId);
    const prediction = known ?? "REVIEW";
    cost += DECISION_COST[label.decision][prediction];
    baseline += DECISION_COST[label.decision].REVIEW;
    if (known === label.decision) correct += 1;
    if (label.decision !== "DIFFERENT_ENTITY" && known === "DIFFERENT_ENTITY") unsafe += 1;
  }
  if (labeled === 0) return null;
  return {
    cost,
    baseline,
    savings: baseline - cost,
    fitness: baseline > 0 ? 100 * Math.max(0, 1 - cost / baseline) : null,
    correct,
    labeled,
    unsafe,
  };
}

export function workloadOf(rows: readonly { decision: Decision }[]): Workload {
  const workload: Workload = { review: 0, different: 0, same: 0 };
  for (const row of rows) {
    if (row.decision === "REVIEW") workload.review += 1;
    else if (row.decision === "DIFFERENT_ENTITY") workload.different += 1;
    else workload.same += 1;
  }
  return workload;
}

export function overfitReport(development: LabelScore | null, heldOut: LabelScore | null): OverfitReport {
  if (!development || !heldOut) return UNMEASURED;
  const developmentFitness = development.fitness;
  const heldOutFitness = heldOut.fitness;
  if (developmentFitness == null || heldOutFitness == null) return UNMEASURED;
  return {
    measured: true,
    overfit: heldOutFitness < developmentFitness,
    developmentFitness,
    heldOutFitness,
    gap: developmentFitness - heldOutFitness,
  };
}

/** One formula for the desk. Labels are the run's own files, never another dataset. */
export function runMetrics(
  rows: readonly { hitId: string; decision: Decision }[],
  labels: readonly PracticeLabel[] | null | undefined,
  heldOutLabels: readonly PracticeLabel[] | null | undefined,
): RunMetrics {
  const labeled = scoreLabels(rows, labels);
  const heldOut = scoreLabels(rows, heldOutLabels);
  return {
    workload: workloadOf(rows),
    labeled,
    overfit: overfitReport(labeled, heldOut),
  };
}

/** One decimal, with a trailing .0 dropped. */
export function formatMetricNumber(value: number): string {
  const text = value.toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

export function fitnessText(metrics: RunMetrics | null | undefined): string {
  if (metrics?.labeled?.fitness == null) return "Fitness unavailable";
  return `Fitness ${formatMetricNumber(metrics.labeled.fitness)}`;
}

export function accuracyText(metrics: RunMetrics | null | undefined): string {
  const labeled = metrics?.labeled;
  if (!labeled) return "Accuracy unavailable";
  return `Accuracy ${formatMetricNumber((100 * labeled.correct) / labeled.labeled)}% (${labeled.correct}/${labeled.labeled})`;
}

export function overfitText(metrics: RunMetrics | null | undefined): string {
  const overfit = metrics?.overfit;
  if (!overfit?.measured || overfit.gap == null || overfit.developmentFitness == null || overfit.heldOutFitness == null) {
    return "Overfitting is not measured.";
  }
  const numbers = `development fitness ${formatMetricNumber(overfit.developmentFitness)}, held-out fitness ${formatMetricNumber(overfit.heldOutFitness)}, gap ${formatMetricNumber(overfit.gap)}`;
  if (!overfit.overfit) return `Overfitting is not present. ${numbers}.`;
  return `Overfitting: ${numbers}.`;
}

export function costText(metrics: RunMetrics | null | undefined): string {
  const labeled = metrics?.labeled;
  if (!labeled) return "Cost unavailable";
  const unsafe =
    labeled.unsafe === 1 ? "1 unsafe clearance" : `${labeled.unsafe} unsafe clearances`;
  return `Cost ${labeled.cost}, baseline ${labeled.baseline}, ${unsafe}`;
}

export function savingsText(metrics: RunMetrics | null | undefined): string {
  if (!metrics?.labeled) return "Savings unavailable";
  return `Savings ${metrics.labeled.savings}`;
}

export function customerValueText(metrics: RunMetrics | null | undefined): string {
  const labeled = metrics?.labeled;
  if (!labeled) return "Customer value unavailable";
  const unsafe =
    labeled.unsafe === 1 ? "1 unsafe clearance already costs 60" : `${labeled.unsafe} unsafe clearances already cost 60`;
  return `Customer value ${labeled.savings}: net value versus review-everything is ${labeled.savings}, and ${unsafe} inside the matrix so that cost is not subtracted again.`;
}

export function workloadText(metrics: RunMetrics | null | undefined): string {
  const workload = metrics?.workload ?? { review: 0, different: 0, same: 0 };
  const reviews = workload.review === 1 ? "1 review to open" : `${workload.review} reviews to open`;
  return `Workload, not the judging score: ${reviews}, ${workload.different} cleared, ${workload.same} confirmed.`;
}
