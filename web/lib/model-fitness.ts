import { decisionScore, formatDecisionScore, reviewerReport } from "./reviewer-cost.ts";
import type { Decision, ModelCount, ModelFitness, PracticeLabel } from "./types.ts";

const DECISIONS = new Set<Decision>(["DIFFERENT_ENTITY", "SAME_ENTITY", "REVIEW"]);

function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && DECISIONS.has(value as Decision);
}

/** Practice labels store the three decisions. validate.py scores that field directly. */
export function parsePracticeLabels(text: string): Map<string, Decision> {
  const labels = new Map<string, Decision>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: unknown;
    try {
      row = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const record = row as { hit_id?: unknown; decision?: unknown };
    if (typeof record.hit_id !== "string" || record.hit_id.length === 0 || !isDecision(record.decision)) continue;
    if (!labels.has(record.hit_id)) labels.set(record.hit_id, record.decision);
  }
  return labels;
}

/**
 * Fitness is reviewerReport's decision score. Accuracy counts labeled hits in this run.
 * A run with no labeled hit, or a zero review baseline, leaves fitness null.
 */
export function scoreModelFitness(
  rows: readonly { hitId: string; decision: Decision }[],
  labels: ReadonlyMap<string, Decision> | null,
): ModelFitness {
  const list = labels ? [...labels].map(([hitId, decision]) => ({ hitId, decision })) : null;
  const figures = accuracyFigures(rows, list);
  const judging = list && list.length > 0 ? reviewerReport(rows, list).judging : null;
  const fitness =
    judging && figures.labeledInRun > 0 && judging.baseline > 0 ? decisionScore(judging.cost, judging.baseline) : null;
  return {
    labelsRead: labels != null,
    fitness,
    cost: judging?.cost ?? 0,
    baseline: judging?.baseline ?? 0,
    accuracy: figures.accuracy,
    clearancePrecision: figures.clearancePrecision,
    sameEntityRecall: figures.sameEntityRecall,
    labeled: figures.labeledInRun,
    unlabeled: figures.unlabeled,
    hits: figures.hits,
  };
}


export type AccuracyFigures = {
  accuracy: ModelCount | null;
  clearancePrecision: ModelCount | null;
  sameEntityRecall: ModelCount | null;
  /** Practice labels whose hit is in this run. */
  labeledInRun: number;
  unlabeled: number;
  hits: number;
};

/**
 * Accuracy on practice labels that appear in this run.
 * The decision score itself stays in reviewer-cost.ts. This does not rescore it.
 * A labeled hit that is not in the run is left out. An empty overlap is unavailable.
 */
export function accuracyFigures(
  rows: readonly { hitId: string; decision: Decision }[],
  labels: readonly PracticeLabel[] | null | undefined,
): AccuracyFigures {
  const seen = new Set<string>();
  const predicted = new Map<string, Decision>();
  for (const row of rows) {
    if (!row.hitId) continue;
    seen.add(row.hitId);
    predicted.set(row.hitId, row.decision);
  }
  const hits = seen.size;
  const empty: AccuracyFigures = {
    accuracy: null,
    clearancePrecision: null,
    sameEntityRecall: null,
    labeledInRun: 0,
    unlabeled: hits,
    hits,
  };
  if (!labels || labels.length === 0) return empty;

  const used = new Set<string>();
  let correct = 0;
  let predictedClear = 0;
  let trueClear = 0;
  let trueSame = 0;
  let samePredicted = 0;
  for (const label of labels) {
    if (used.has(label.hitId)) continue;
    const prediction = predicted.get(label.hitId);
    if (!prediction) continue;
    used.add(label.hitId);
    if (prediction === label.decision) correct += 1;
    if (prediction === "DIFFERENT_ENTITY") {
      predictedClear += 1;
      if (label.decision === "DIFFERENT_ENTITY") trueClear += 1;
    }
    if (label.decision === "SAME_ENTITY") {
      trueSame += 1;
      if (prediction === "SAME_ENTITY") samePredicted += 1;
    }
  }
  if (used.size === 0) return { ...empty, unlabeled: hits };
  return {
    accuracy: { correct, total: used.size },
    clearancePrecision: predictedClear > 0 ? { correct: trueClear, total: predictedClear } : null,
    sameEntityRecall: trueSame > 0 ? { correct: samePredicted, total: trueSame } : null,
    labeledInRun: used.size,
    unlabeled: hits - used.size,
    hits,
  };
}

/** Practice labels that name a hit in this run. An upload with none of them has no labels. */
export function labelsOnRows(
  rows: readonly { hitId: string }[],
  labels: readonly PracticeLabel[] | null | undefined,
): PracticeLabel[] | null {
  if (!labels || labels.length === 0) return null;
  const ids = new Set(rows.map((row) => row.hitId));
  const matched: PracticeLabel[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    if (!ids.has(label.hitId) || seen.has(label.hitId)) continue;
    seen.add(label.hitId);
    matched.push(label);
  }
  return matched.length > 0 ? matched : null;
}

export function formatModelPercent(correct: number, total: number): string {
  return `${formatDecisionScore((100 * correct) / total)}% (${correct}/${total})`;
}

/** Their decision score, labeled as fitness. A zero baseline or no labeled hit is unavailable. */
export function fitnessText(
  score: number | null | undefined,
  baseline: number | null | undefined,
  labeledInRun: number,
): string {
  if (labeledInRun <= 0 || score == null || baseline == null || baseline <= 0) return "Fitness unavailable";
  return `Fitness ${formatDecisionScore(score)}`;
}

export function accuracyText(figures: AccuracyFigures | null | undefined): string {
  if (!figures?.accuracy) {
    return "Accuracy unavailable. Clearance precision unavailable. Same-entity recall unavailable";
  }
  const precision = figures.clearancePrecision
    ? `Clearance precision ${formatModelPercent(figures.clearancePrecision.correct, figures.clearancePrecision.total)}`
    : "Clearance precision unavailable";
  const recall = figures.sameEntityRecall
    ? `Same-entity recall ${formatModelPercent(figures.sameEntityRecall.correct, figures.sameEntityRecall.total)}`
    : "Same-entity recall unavailable";
  return `Accuracy ${formatModelPercent(figures.accuracy.correct, figures.accuracy.total)}. ${precision}. ${recall}`;
}
