import assert from "node:assert/strict";
import test from "node:test";

import {
  accuracyText,
  costText,
  customerValueText,
  fitnessText,
  overfitText,
  runMetrics,
  savingsText,
  scoreLabels,
} from "./run-metrics.ts";
import type { Decision, PracticeLabel } from "./types.ts";

const label = (hitId: string, decision: Decision): PracticeLabel => ({ hitId, decision });
const row = (hitId: string, decision: Decision) => ({ hitId, decision });

test("the matrix matches validate.py and a missing hit counts as review", () => {
  const score = scoreLabels(
    [
      row("D", "SAME_ENTITY"),
      row("S", "DIFFERENT_ENTITY"),
      row("R", "SAME_ENTITY"),
    ],
    [
      label("D", "DIFFERENT_ENTITY"),
      label("S", "SAME_ENTITY"),
      label("R", "REVIEW"),
      label("M", "SAME_ENTITY"),
    ],
  );
  assert.equal(score?.cost, 3 + 60 + 2 + 2);
  assert.equal(score?.baseline, 3 + 2 + 0 + 2);
  assert.equal(score?.savings, score!.baseline - score!.cost);
  assert.equal(score?.unsafe, 1);
  assert.equal(score?.correct, 0);
  assert.equal(score?.labeled, 4);
  assert.equal(score?.fitness, 0);
});

test("a perfect labeled run saves the whole baseline and does not subtract unsafe twice", () => {
  const labels = [label("D", "DIFFERENT_ENTITY"), label("S", "SAME_ENTITY"), label("R", "REVIEW")];
  const metrics = runMetrics(
    [
      row("D", "DIFFERENT_ENTITY"),
      row("S", "SAME_ENTITY"),
      row("R", "REVIEW"),
      row("U", "REVIEW"),
    ],
    labels,
    null,
  );
  assert.equal(metrics.labeled?.cost, 0);
  assert.equal(metrics.labeled?.baseline, 5);
  assert.equal(metrics.labeled?.savings, 5);
  assert.equal(metrics.labeled?.fitness, 100);
  assert.equal(metrics.labeled?.correct, 3);
  assert.equal(metrics.labeled?.unsafe, 0);
  assert.equal(metrics.overfit.measured, false);
  assert.deepEqual(metrics.workload, { review: 2, different: 1, same: 1 });
  assert.match(customerValueText(metrics), /Customer value 5/);
  assert.match(customerValueText(metrics), /net value versus review-everything is 5/);
  assert.match(customerValueText(metrics), /not subtracted again/);
  assert.equal(fitnessText(metrics), "Fitness 100");
  assert.equal(accuracyText(metrics), "Accuracy 100% (3/3)");
  assert.equal(overfitText(metrics), "Overfitting is not measured.");
  assert.equal(savingsText(metrics), "Savings 5");
});

test("fitness is unavailable when there are no labels or the baseline is 0", () => {
  const unlabeled = runMetrics([row("A", "REVIEW"), row("B", "DIFFERENT_ENTITY")], [], null);
  assert.equal(unlabeled.labeled, null);
  assert.equal(fitnessText(unlabeled), "Fitness unavailable");
  assert.equal(accuracyText(unlabeled), "Accuracy unavailable");
  assert.equal(costText(unlabeled), "Cost unavailable");
  assert.equal(savingsText(unlabeled), "Savings unavailable");
  assert.equal(customerValueText(unlabeled), "Customer value unavailable");
  assert.deepEqual(unlabeled.workload, { review: 1, different: 1, same: 0 });

  const reviews = runMetrics([row("R", "REVIEW")], [label("R", "REVIEW")], null);
  assert.equal(reviews.labeled?.baseline, 0);
  assert.equal(reviews.labeled?.fitness, null);
  assert.equal(reviews.labeled?.savings, 0);
  assert.equal(fitnessText(reviews), "Fitness unavailable");
  assert.equal(accuracyText(reviews), "Accuracy 100% (1/1)");
  assert.equal(overfitText(reviews), "Overfitting is not measured.");
});

test("overfitting is the held-out gap, and only when both fitness numbers exist", () => {
  const rows = [row("A", "DIFFERENT_ENTITY"), row("B", "SAME_ENTITY")];
  const practice = [label("A", "DIFFERENT_ENTITY"), label("B", "SAME_ENTITY")];
  const heldOut = [label("A", "SAME_ENTITY"), label("B", "SAME_ENTITY")];
  const metrics = runMetrics(rows, practice, heldOut);
  assert.equal(metrics.overfit.measured, true);
  assert.equal(metrics.overfit.overfit, true);
  assert.equal(metrics.overfit.developmentFitness, 100);
  assert.equal(metrics.labeled?.fitness, 100);
  assert.ok((metrics.overfit.heldOutFitness ?? 100) < 100);
  assert.equal(metrics.overfit.gap, (metrics.overfit.developmentFitness ?? 0) - (metrics.overfit.heldOutFitness ?? 0));
  assert.match(overfitText(metrics), /Overfitting: development fitness 100, held-out fitness/);
  assert.match(overfitText(metrics), /gap/);

  const tied = runMetrics(rows, practice, practice);
  assert.equal(tied.overfit.measured, true);
  assert.equal(tied.overfit.overfit, false);
  assert.equal(tied.overfit.gap, 0);
  assert.match(overfitText(tied), /Overfitting is not present/);

  const oneSided = runMetrics(rows, [label("A", "REVIEW")], [label("A", "REVIEW")]);
  assert.equal(oneSided.overfit.measured, false);
  assert.equal(overfitText(oneSided), "Overfitting is not measured.");
});
