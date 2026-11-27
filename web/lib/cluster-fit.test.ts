import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isClusterFit } from "./cluster-fit.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the committed k-means fit does not use the rules decision and covers every hit", async () => {
  const fit = JSON.parse(await readFile(path.join(repoRoot, "web/public/demo/clusters.json"), "utf8")) as unknown;
  assert.equal(isClusterFit(fit), true);
  if (!isClusterFit(fit)) return;
  assert.equal(fit.n, 819);
  assert.equal(fit.k, 8);
  assert.equal(fit.silhouette, 0.4524);
  assert.equal(fit.parameters.random_state, 7);
  assert.ok(fit.excluded.includes("decision"));
  assert.ok(fit.excluded.includes("closeness"));
  assert.equal(
    fit.clusters.reduce((sum, cluster) => sum + cluster.size, 0),
    819,
  );
  assert.equal(
    fit.crosstab.reduce((sum, row) => sum + row.cleared + row.confirmed + row.review, 0),
    819,
  );
  assert.equal(fit.hits.length, 819);
  assert.equal(fit.pca.length, 819);
  const best = Math.max(...fit.silhouetteByK.map((row) => row.silhouette));
  assert.equal(fit.silhouette, best);
  const review = fit.hits.find((hit) => hit.hitId === "H-E319FE");
  assert.ok(review);
  assert.equal(review?.neighbors.length, 3);
  assert.equal(fit.agreement.agree, 626);
  assert.equal(fit.agreement.n, 819);
  assert.equal(fit.agreement.percent, 76.43);
  assert.equal(fit.rulesPlusCluster.before.cleared, 465);
  assert.equal(fit.rulesPlusCluster.before.confirmed, 122);
  assert.equal(fit.rulesPlusCluster.before.review, 232);
  assert.equal(fit.rulesPlusCluster.after.cleared, 447);
  assert.equal(fit.rulesPlusCluster.after.confirmed, 118);
  assert.equal(fit.rulesPlusCluster.after.review, 254);
  assert.equal(fit.rulesPlusCluster.changed, 22);
  assert.equal(fit.rulesPlusCluster.flagged, 193);
  assert.ok(fit.timing.totalSeconds > 0);
  assert.ok(Math.abs(fit.timing.fitSeconds + fit.timing.predictSeconds - fit.timing.totalSeconds) < 1e-4);
  const flagged = fit.hits.filter((hit) => hit.escalation.sentToReview);
  assert.equal(flagged.length, 193);
  assert.ok(flagged.every((hit) => hit.combined === "REVIEW" && hit.rules === hit.escalation.combined || hit.combined === "REVIEW"));
});
