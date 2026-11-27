import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isClusterFit } from "./cluster-fit.ts";
import { applyCombinedOutcome } from "./combined-outcome.ts";
import { payloadFromDevJsonl } from "../scripts/demo-pack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the combined outcome is the headline and the 22 moved hits are review", async () => {
  const text = await readFile(path.join(repoRoot, "output", "dev.jsonl"), "utf8");
  const fit = JSON.parse(await readFile(path.join(repoRoot, "web/public/demo/clusters.json"), "utf8")) as unknown;
  assert.equal(isClusterFit(fit), true);
  if (!isClusterFit(fit)) return;
  const rows = applyCombinedOutcome(payloadFromDevJsonl(text).rows, fit.hits);
  const review = rows.filter((row) => row.decision === "REVIEW");
  assert.equal(rows.filter((row) => row.decision === "DIFFERENT_ENTITY").length, 447);
  assert.equal(rows.filter((row) => row.decision === "SAME_ENTITY").length, 118);
  assert.equal(review.length, 254);
  const moved = rows.filter((row) => row.escalatedToReview);
  assert.equal(moved.length, 22);
  assert.ok(moved.every((row) => row.decision === "REVIEW"));
  const sample = rows.find((row) => row.hitId === "H-BD709E");
  assert.equal(sample?.decision, "REVIEW");
  assert.equal(sample?.rulesDecision, "DIFFERENT_ENTITY");
  assert.equal(sample?.escalationNote, "Rules: cleared → escalated to review (k-means disagreement)");
  const untouched = rows.find((row) => row.hitId === "H-32BBAE");
  assert.equal(untouched?.decision, "DIFFERENT_ENTITY");
  assert.equal(untouched?.escalatedToReview, false);
});
