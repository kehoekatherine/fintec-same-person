import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { payloadFromDevJsonl } from "../scripts/demo-pack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the public pack keeps recorded decisions and the compared names", async () => {
  const text = await readFile(path.join(repoRoot, "output", "dev.jsonl"), "utf8");
  const payload = payloadFromDevJsonl(text);
  assert.equal(payload.source, "development");
  assert.equal(payload.mode, "recorded");
  assert.equal(payload.rows.length, 819);
  const review = payload.rows.find((row) => row.hitId === "H-E319FE");
  assert.ok(review);
  assert.equal(review.decision, "REVIEW");
  assert.equal(review.name, "SEGUN ADEWALE");
  assert.equal(review.listedName, "Adewale, Segun");
  assert.equal(review.closeness?.total, 80);
  assert.equal(review.closeness?.dateOfBirth, 10);
  const cleared = payload.rows.find((row) => row.hitId === "H-32BBAE");
  assert.ok(cleared);
  assert.equal(cleared.decision, "DIFFERENT_ENTITY");
  assert.equal(cleared.closeness, null);
  assert.equal(cleared.comparison?.name.status, "different");
});
