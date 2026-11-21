import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readLabelSets } from "./run-labels.ts";

const practice = [
  JSON.stringify({ hit_id: "H-1", decision: "SAME_ENTITY" }),
  JSON.stringify({ hit_id: "H-2", decision: "MAYBE" }),
  JSON.stringify({ hit_id: "H-3", decision: "REVIEW" }),
].join("\n");

test("one label file does not invent a held-out split", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "run-labels-"));
  try {
    await writeFile(path.join(dir, "practice_labels.jsonl"), practice);
    const sets = await readLabelSets(dir);
    assert.deepEqual(
      sets.labels.map((label) => label.hitId),
      ["H-1", "H-3"],
    );
    assert.equal(sets.heldOutLabels, null);
    assert.equal(sets.practiceFile, "practice_labels.jsonl");
    assert.equal(sets.heldOutFile, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a separate held-out file is scored on its own", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "run-labels-"));
  try {
    await writeFile(path.join(dir, "practice_labels.jsonl"), practice);
    await writeFile(
      path.join(dir, "heldout_labels.jsonl"),
      JSON.stringify({ hit_id: "H-9", decision: "DIFFERENT_ENTITY" }),
    );
    const sets = await readLabelSets(dir);
    assert.equal(sets.labels.length, 2);
    assert.deepEqual(sets.heldOutLabels, [{ hitId: "H-9", decision: "DIFFERENT_ENTITY" }]);
    assert.equal(sets.heldOutFile, "heldout_labels.jsonl");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
