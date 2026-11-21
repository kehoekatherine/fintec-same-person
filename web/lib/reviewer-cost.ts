import type { Decision } from "@/lib/types";

/**
 * Judging matrix from validate.py.
 * The outer key is the true decision. The inner key is the prediction.
 * Baseline is the cost of sending every labeled hit to REVIEW.
 */
export const DECISION_COST: Record<Decision, Record<Decision, number>> = {
  DIFFERENT_ENTITY: { DIFFERENT_ENTITY: 0, SAME_ENTITY: 3, REVIEW: 3 },
  SAME_ENTITY: { DIFFERENT_ENTITY: 60, SAME_ENTITY: 0, REVIEW: 2 },
  REVIEW: { DIFFERENT_ENTITY: 60, SAME_ENTITY: 2, REVIEW: 0 },
};

export type ScoredHit = {
  hitId: string;
  decision: Decision;
};

export type ReviewerWorkload = {
  review: number;
  different: number;
  same: number;
};

/** Matrix cost for the hits that have a label. Unlabeled hits are not scored. */
export type JudgingCost = {
  cost: number;
  baseline: number;
  /** 100 * max(0, 1 - cost / baseline). A zero baseline scores 0. */
  score: number;
  labeled: number;
  unlabeled: number;
  /** True SAME or true REVIEW predicted DIFFERENT. */
  unsafe: number;
  /** Labels whose hit is not in the run. Those predictions count as REVIEW. */
  missingLabels: number;
};

export type ReviewerReport = {
  workload: ReviewerWorkload;
  judging: JudgingCost | null;
};

export function reviewerReport(
  rows: readonly ScoredHit[],
  labels: readonly ScoredHit[] | null | undefined,
): ReviewerReport {
  const workload: ReviewerWorkload = { review: 0, different: 0, same: 0 };
  const predicted = new Map<string, Decision>();
  for (const row of rows) {
    if (row.decision === "REVIEW") workload.review += 1;
    else if (row.decision === "DIFFERENT_ENTITY") workload.different += 1;
    else workload.same += 1;
    predicted.set(row.hitId, row.decision);
  }

  if (!labels || labels.length === 0) return { workload, judging: null };

  const labeledIds = new Set<string>();
  let cost = 0;
  let baseline = 0;
  let unsafe = 0;
  let missingLabels = 0;
  for (const label of labels) {
    labeledIds.add(label.hitId);
    const known = predicted.get(label.hitId);
    if (!known) missingLabels += 1;
    const prediction = known ?? "REVIEW";
    cost += DECISION_COST[label.decision][prediction];
    baseline += DECISION_COST[label.decision].REVIEW;
    if (label.decision !== "DIFFERENT_ENTITY" && prediction === "DIFFERENT_ENTITY") unsafe += 1;
  }

  let unlabeled = 0;
  for (const row of rows) {
    if (!labeledIds.has(row.hitId)) unlabeled += 1;
  }

  return {
    workload,
    judging: {
      cost,
      baseline,
      score: decisionScore(cost, baseline),
      labeled: labels.length,
      unlabeled,
      unsafe,
      missingLabels,
    },
  };
}

export function decisionScore(cost: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return 100 * Math.max(0, 1 - cost / baseline);
}

/** One decimal, matching validate.py, with a trailing .0 dropped. */
export function formatDecisionScore(score: number): string {
  const text = score.toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}
