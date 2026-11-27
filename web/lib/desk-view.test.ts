import assert from "node:assert/strict";
import test from "node:test";

import { caseUsd } from "./model-prices.ts";
import { costSection, deskView } from "./desk-view.ts";

test("view and cost section read the address the alerts desk uses", () => {
  assert.equal(deskView(null), "queue");
  assert.equal(deskView("analysis"), "analysis");
  assert.equal(deskView("case"), "analysis");
  assert.equal(deskView("cost"), "cost");
  assert.equal(costSection(null), "models");
  assert.equal(costSection("classical"), "classical");
  assert.equal(costSection("ml"), "classical");
  assert.equal(costSection("risk"), "risk");
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
