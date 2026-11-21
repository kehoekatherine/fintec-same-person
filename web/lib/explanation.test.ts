import assert from "node:assert/strict";
import test from "node:test";

import { actionFor, customerFileMessage, groundsToShow, UNCHECKED_GROUNDS } from "./explanation.ts";

test("unchecked grounds show only the stored code", () => {
  assert.deepEqual(groundsToShow("DOB_MISMATCH", false, ["LOCATION_MISMATCH", "DOB_MISMATCH"]), ["DOB_MISMATCH"]);
  assert.deepEqual(groundsToShow("", false, []), []);
  assert.equal(UNCHECKED_GROUNDS, "Other grounds were not re-checked.");
});

test("checked grounds stay in priority order and keep the stored code", () => {
  assert.deepEqual(
    groundsToShow("DOB_MISMATCH", true, ["LOCATION_MISMATCH", "DOB_MISMATCH"]),
    ["DOB_MISMATCH", "LOCATION_MISMATCH"],
  );
  assert.deepEqual(groundsToShow("INSUFFICIENT_DATA", true, ["DOB_MISMATCH"]), [
    "DOB_MISMATCH",
    "INSUFFICIENT_DATA",
  ]);
  assert.deepEqual(groundsToShow("NAME_DOB_LOCATION_MATCH", true, ["NAME_DOB_LOCATION_MATCH"]), [
    "NAME_DOB_LOCATION_MATCH",
  ]);
});

test("actions follow the decision", () => {
  assert.equal(
    actionFor("DIFFERENT_ENTITY", "CUS-1"),
    "This hit can be cleared. The alert stays open until every hit on it is cleared.",
  );
  assert.equal(actionFor("SAME_ENTITY", "CUS-1"), "This is the same person or company. Do not clear it.");
  assert.equal(actionFor("REVIEW", "CUS-1"), "Do not clear it. A person decides.");
  assert.equal(
    actionFor("REVIEW", "AMBIGUOUS"),
    "Do not clear it. A person decides. The customer record is AMBIGUOUS.",
  );
  assert.equal(actionFor("REVIEW", null), "Do not clear it. A person decides. No customer id was resolved.");
});

test("a missing customer id is named and nothing is invented for sentinels", () => {
  assert.equal(customerFileMessage("CUS-404", true), "CUS-404 is not in customers.jsonl.");
  assert.equal(customerFileMessage("CUS-1", false), null);
  assert.equal(customerFileMessage("AMBIGUOUS", true), null);
  assert.equal(customerFileMessage(null, true), null);
});
