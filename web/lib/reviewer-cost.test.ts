import assert from "node:assert/strict";
import test from "node:test";

import { decisionScore, formatDecisionScore, reviewerReport, type ScoredHit } from "./reviewer-cost.ts";

const labels: ScoredHit[] = [
  { hitId: "D", decision: "DIFFERENT_ENTITY" },
  { hitId: "S", decision: "SAME_ENTITY" },
  { hitId: "R", decision: "REVIEW" },
];

test("a perfect labeled run scores 100 and leaves unlabeled hits out", () => {
  const report = reviewerReport(
    [
      { hitId: "D", decision: "DIFFERENT_ENTITY" },
      { hitId: "S", decision: "SAME_ENTITY" },
      { hitId: "R", decision: "REVIEW" },
      { hitId: "U", decision: "REVIEW" },
    ],
    labels,
  );
  assert.equal(report.judging?.cost, 0);
  assert.equal(report.judging?.baseline, 5);
  assert.equal(report.judging?.score, 100);
  assert.equal(report.judging?.labeled, 3);
  assert.equal(report.judging?.unlabeled, 1);
  assert.equal(report.judging?.unsafe, 0);
  assert.deepEqual(report.workload, { review: 2, different: 1, same: 1 });
});

test("an unsafe clearance costs 60 and the score cannot go below 0", () => {
  const report = reviewerReport(
    [
      { hitId: "D", decision: "SAME_ENTITY" },
      { hitId: "S", decision: "DIFFERENT_ENTITY" },
      { hitId: "R", decision: "SAME_ENTITY" },
    ],
    labels,
  );
  assert.equal(report.judging?.cost, 65);
  assert.equal(report.judging?.baseline, 5);
  assert.equal(report.judging?.unsafe, 1);
  assert.equal(report.judging?.score, 0);
});

test("a labeled hit missing from the run counts as review", () => {
  const report = reviewerReport([{ hitId: "D", decision: "DIFFERENT_ENTITY" }], labels);
  assert.equal(report.judging?.cost, 2);
  assert.equal(report.judging?.missingLabels, 2);
  assert.equal(report.judging?.score, 60);
  assert.equal(report.judging?.unlabeled, 0);
});

test("a run with no labels reports workload and not a judging score", () => {
  const report = reviewerReport(
    [
      { hitId: "A", decision: "REVIEW" },
      { hitId: "B", decision: "DIFFERENT_ENTITY" },
      { hitId: "C", decision: "SAME_ENTITY" },
    ],
    [],
  );
  assert.equal(report.judging, null);
  assert.deepEqual(report.workload, { review: 1, different: 1, same: 1 });
});

test("sending every labeled hit to review scores 0", () => {
  const report = reviewerReport(
    labels.map((label) => ({ hitId: label.hitId, decision: "REVIEW" as const })),
    labels,
  );
  assert.equal(report.judging?.cost, report.judging?.baseline);
  assert.equal(report.judging?.score, 0);
});

test("a zero baseline scores 0", () => {
  const onlyReview = [{ hitId: "R", decision: "REVIEW" as const }];
  const report = reviewerReport(onlyReview, onlyReview);
  assert.equal(report.judging?.baseline, 0);
  assert.equal(report.judging?.cost, 0);
  assert.equal(decisionScore(0, 0), 0);
  assert.equal(report.judging?.score, 0);
});

test("the practice mix baselines at 108 and a perfect run scores 100", () => {
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
  assert.equal(report.judging?.cost, 0);
  assert.equal(report.judging?.baseline, 108);
  assert.equal(report.judging?.score, 100);
  assert.equal(report.judging?.labeled, 50);
  assert.equal(report.judging?.unlabeled, 769);
  assert.equal(report.judging?.unsafe, 0);
  assert.equal(formatDecisionScore(100), "100");
  assert.equal(formatDecisionScore(98.148), "98.1");
});
