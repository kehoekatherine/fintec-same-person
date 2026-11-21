import assert from "node:assert/strict";
import test from "node:test";

import { accuracyFigures, accuracyText, fitnessText, labelsOnRows } from "./model-fitness.ts";
import { decisionScore, formatDecisionScore, reviewerReport, type ScoredHit } from "./reviewer-cost.ts";
import type { Decision, PracticeLabel } from "./types.ts";

const row = (hitId: string, decision: Decision) => ({ hitId, decision });

test("fitness is the reviewer decision score, and accuracy sits beside it", () => {
  const labels: PracticeLabel[] = [
    { hitId: "D", decision: "DIFFERENT_ENTITY" },
    { hitId: "S", decision: "SAME_ENTITY" },
    { hitId: "R", decision: "REVIEW" },
  ];
  const rows = [
    row("D", "DIFFERENT_ENTITY"),
    row("S", "SAME_ENTITY"),
    row("R", "REVIEW"),
    row("U", "DIFFERENT_ENTITY"),
  ];
  const report = reviewerReport(rows, labels);
  const figures = accuracyFigures(rows, labels);
  assert.equal(report.judging?.score, 100);
  assert.equal(report.judging?.baseline, 5);
  assert.equal(fitnessText(report.judging?.score, report.judging?.baseline, figures.labeledInRun), "Fitness 100");
  assert.equal(formatDecisionScore(report.judging?.score ?? 0), "100");
  assert.deepEqual(figures.accuracy, { correct: 3, total: 3 });
  assert.deepEqual(figures.clearancePrecision, { correct: 1, total: 1 });
  assert.deepEqual(figures.sameEntityRecall, { correct: 1, total: 1 });
  assert.equal(figures.unlabeled, 1);
  assert.equal(
    accuracyText(figures),
    "Accuracy 100% (3/3). Clearance precision 100% (1/1). Same-entity recall 100% (1/1)",
  );
});

test("a zero baseline stays unavailable instead of 0 or 100", () => {
  const labels = [{ hitId: "R", decision: "REVIEW" as const }];
  const report = reviewerReport(labels, labels);
  assert.equal(decisionScore(0, 0), 0);
  assert.equal(report.judging?.score, 0);
  assert.equal(report.judging?.baseline, 0);
  const figures = accuracyFigures(labels, labels);
  assert.equal(fitnessText(report.judging?.score, report.judging?.baseline, figures.labeledInRun), "Fitness unavailable");
  assert.deepEqual(figures.accuracy, { correct: 1, total: 1 });
  assert.equal(figures.clearancePrecision, null);
  assert.equal(figures.sameEntityRecall, null);
  assert.match(accuracyText(figures), /Clearance precision unavailable/);
  assert.match(accuracyText(figures), /Same-entity recall unavailable/);
});

test("an upload with no matching label is unavailable rather than zero", () => {
  const labels: PracticeLabel[] = [
    { hitId: "D", decision: "DIFFERENT_ENTITY" },
    { hitId: "S", decision: "SAME_ENTITY" },
  ];
  const rows = [row("U1", "DIFFERENT_ENTITY"), row("U2", "REVIEW")];
  assert.equal(labelsOnRows(rows, labels), null);
  const figures = accuracyFigures(rows, labels);
  assert.equal(figures.labeledInRun, 0);
  assert.equal(figures.accuracy, null);
  assert.equal(fitnessText(100, 108, figures.labeledInRun), "Fitness unavailable");
  assert.equal(
    accuracyText(figures),
    "Accuracy unavailable. Clearance precision unavailable. Same-entity recall unavailable",
  );
  assert.equal(figures.unlabeled, 2);
});

test("clearance precision and same-entity recall use only labeled hits in the run", () => {
  const labels: PracticeLabel[] = [
    { hitId: "C1", decision: "DIFFERENT_ENTITY" },
    { hitId: "C2", decision: "SAME_ENTITY" },
    { hitId: "C3", decision: "REVIEW" },
    { hitId: "C4", decision: "SAME_ENTITY" },
    { hitId: "C5", decision: "SAME_ENTITY" },
    { hitId: "ABSENT", decision: "DIFFERENT_ENTITY" },
  ];
  const rows = [
    row("C1", "SAME_ENTITY"),
    row("C2", "DIFFERENT_ENTITY"),
    row("C3", "DIFFERENT_ENTITY"),
    row("C4", "REVIEW"),
    row("C5", "SAME_ENTITY"),
    row("U", "REVIEW"),
  ];
  const figures = accuracyFigures(rows, labels);
  assert.equal(figures.labeledInRun, 5);
  assert.deepEqual(figures.accuracy, { correct: 1, total: 5 });
  assert.deepEqual(figures.clearancePrecision, { correct: 0, total: 2 });
  assert.deepEqual(figures.sameEntityRecall, { correct: 1, total: 3 });
  assert.equal(accuracyText(figures), "Accuracy 20% (1/5). Clearance precision 0% (0/2). Same-entity recall 33.3% (1/3)");
  const present = labelsOnRows(rows, labels);
  assert.deepEqual(
    present?.map((label) => label.hitId),
    ["C1", "C2", "C3", "C4", "C5"],
  );
  const report = reviewerReport(rows, present ?? []);
  assert.equal(report.judging?.score, decisionScore(report.judging?.cost ?? 0, report.judging?.baseline ?? 0));
  assert.equal(fitnessText(report.judging?.score, report.judging?.baseline, figures.labeledInRun).startsWith("Fitness "), true);
});

test("the practice mix scores 100 fitness and 50 of 50 accuracy", () => {
  const practice: ScoredHit[] = [
    ...Array.from({ length: 28 }, (_, index) => ({ hitId: `D${index}`, decision: "DIFFERENT_ENTITY" as const })),
    ...Array.from({ length: 12 }, (_, index) => ({ hitId: `S${index}`, decision: "SAME_ENTITY" as const })),
    ...Array.from({ length: 10 }, (_, index) => ({ hitId: `R${index}`, decision: "REVIEW" as const })),
  ];
  const rows = [
    ...practice,
    ...Array.from({ length: 769 }, (_, index) => ({ hitId: `U${index}`, decision: "DIFFERENT_ENTITY" as const })),
  ];
  const report = reviewerReport(rows, practice);
  const figures = accuracyFigures(rows, practice);
  assert.equal(report.judging?.cost, 0);
  assert.equal(report.judging?.baseline, 108);
  assert.equal(report.judging?.score, 100);
  assert.equal(fitnessText(report.judging?.score, report.judging?.baseline, figures.labeledInRun), "Fitness 100");
  assert.deepEqual(figures.accuracy, { correct: 50, total: 50 });
  assert.deepEqual(figures.clearancePrecision, { correct: 28, total: 28 });
  assert.deepEqual(figures.sameEntityRecall, { correct: 12, total: 12 });
  assert.equal(figures.unlabeled, 769);
  assert.equal(figures.hits, 819);
});
