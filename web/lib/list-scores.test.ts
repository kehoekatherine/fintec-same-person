import assert from "node:assert/strict";
import test from "node:test";

import { confidenceFor } from "./list-scores.ts";
import { sortRows, type SortState } from "./list-sort.ts";
import type { Closeness, ResultRow } from "./types.ts";

const close: Closeness = {
  total: 100,
  band: "Close",
  name: 40,
  dateOfBirth: 30,
  country: 30,
};

test("confidence discounts closeness by bias risk", () => {
  const score = confidenceFor({
    decision: "REVIEW",
    reasonCode: "INSUFFICIENT_DATA",
    closeness: close,
    bias: {
      total: 40,
      band: "Elevated",
      reasons: [],
    },
  });
  assert.equal(score.total, 60);
  assert.equal(score.band, "Moderate");
  assert.match(score.detail, /Closeness 100/);
  assert.match(score.detail, /bias risk 40/);
});

test("a date contradiction is a high-confidence clearance", () => {
  const score = confidenceFor({
    decision: "DIFFERENT_ENTITY",
    reasonCode: "DOB_MISMATCH",
    closeness: null,
    bias: null,
  });
  assert.equal(score.total, 90);
  assert.equal(score.band, "High");
});

test("closeness sorts high to low and leaves cleared hits at the end", () => {
  const rows = [
    row("H-1", "REVIEW", 40),
    row("H-2", "DIFFERENT_ENTITY", null),
    row("H-3", "SAME_ENTITY", 100),
  ];
  const desc: SortState = { key: "closeness", dir: "desc" };
  assert.deepEqual(
    sortRows(rows, desc).map((item) => item.hitId),
    ["H-3", "H-1", "H-2"],
  );
  const asc: SortState = { key: "closeness", dir: "asc" };
  assert.deepEqual(
    sortRows(rows, asc).map((item) => item.hitId),
    ["H-1", "H-3", "H-2"],
  );
});

function row(hitId: string, decision: ResultRow["decision"], closeness: number | null): ResultRow {
  return {
    hitId,
    alertId: "A-1",
    decision,
    reasonCode: decision === "DIFFERENT_ENTITY" ? "DOB_MISMATCH" : "INSUFFICIENT_DATA",
    customerRecordId: "CUS-1",
    customerInFile: true,
    reason: "Recorded reason.",
    evidence: [],
    comparison: null,
    closeness:
      closeness == null
        ? null
        : { total: closeness, band: closeness >= 80 ? "Close" : "Partial", name: 0, dateOfBirth: 0, country: 0 },
    name: "Ada",
    listedName: "Ada",
    customerDob: "1980-01-01",
    customerCountry: "France",
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
  };
}
