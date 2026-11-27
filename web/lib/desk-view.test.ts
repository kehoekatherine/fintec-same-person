import assert from "node:assert/strict";
import test from "node:test";

import { caseUsd } from "./model-prices.ts";
import { costSection, deskView, legacyAddress } from "./desk-view.ts";

test("about is the page with no view, and a bare hit opens analysis", () => {
  assert.equal(deskView(null), "about");
  assert.equal(deskView("about"), "about");
  assert.equal(deskView("summary"), "about");
  assert.equal(deskView(null, "H-E319FE"), "analysis");
  assert.equal(deskView("queue", "H-E319FE"), "analysis");
  assert.equal(deskView("queue"), "about");
  assert.equal(deskView("analysis"), "analysis");
  assert.equal(deskView("case"), "analysis");
  assert.equal(deskView("cost"), "cost");
});

test("a removed cost section falls back to language models", () => {
  assert.equal(costSection(null), "models");
  assert.equal(costSection("classical"), "models");
  assert.equal(costSection("ml"), "models");
  assert.equal(costSection("risk"), "risk");
  assert.deepEqual(legacyAddress(null, null, "H-1"), { view: "analysis" });
  assert.deepEqual(legacyAddress("queue", null, null), { view: null, hit: null, section: null });
  assert.deepEqual(legacyAddress("cost", "classical", null), { section: null });
  assert.equal(legacyAddress("cost", "risk", null), null);
});

test("a model price is input tokens plus output tokens, with no accuracy attached", () => {
  const model = {
    id: "example",
    label: "Example",
    chartLabel: "Example",
    provider: "Example",
    hosting: "closed" as const,
    inputUsdPerMtok: 2,
    outputUsdPerMtok: 8,
    source: "https://example.invalid",
    sourceNote: "fixture",
    publishedOutputTokensPerSec: null,
    assumedOutputTokensPerSec: 40,
    speedNote: "assumption",
  };
  assert.equal(caseUsd(1000, 500, model), 0.006);
});
