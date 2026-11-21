import assert from "node:assert/strict";
import test from "node:test";

import { biasRiskForCase, scoreBias, type BiasInput } from "./bias-risk.ts";
import type { DeskCase, Decision } from "./types.ts";

/** Published rule patterns. They are not development customers and the desk does not open them. */
const PATTERNS: Record<string, { decision: Decision; reasonCode: string; customer: string; dob: string | null; country: string | null; listed: string; aliases: string[]; dobs: string[]; countries: string[] }> = {
  "H-B10001": {
    decision: "DIFFERENT_ENTITY",
    reasonCode: "DOB_MISMATCH",
    customer: "Mohammed Ali",
    dob: "1988-03-14",
    country: "United Kingdom",
    listed: "Mohamed Ali",
    aliases: [],
    dobs: ["1952"],
    countries: ["Egypt"],
  },
  "H-B10002": {
    decision: "SAME_ENTITY",
    reasonCode: "NAME_DOB_LOCATION_MATCH",
    customer: "Li Wei",
    dob: "1975",
    country: "Singapore",
    listed: "Wei Li",
    aliases: ["Li Wei"],
    dobs: ["1975"],
    countries: ["Singapore"],
  },
  "H-B10003": {
    decision: "REVIEW",
    reasonCode: "INSUFFICIENT_DATA",
    customer: "Anna K. Petrova",
    dob: null,
    country: null,
    listed: "Anna Petrova",
    aliases: [],
    dobs: ["1969"],
    countries: ["Russia"],
  },
  "H-B10004": {
    decision: "DIFFERENT_ENTITY",
    reasonCode: "TEMPORAL_IMPOSSIBILITY",
    customer: "Tom Okafor",
    dob: "2004",
    country: "Nigeria",
    listed: "Thomas Okafor",
    aliases: [],
    dobs: [],
    countries: [],
  },
};

function briefCase(hitId: string): DeskCase {
  const pattern = PATTERNS[hitId];
  if (!pattern) throw new Error(`missing ${hitId}`);
  return {
    hitId,
    alertId: "A-pattern",
    screened: {
      name: pattern.customer,
      entityType: null,
      dob: pattern.dob,
      country: pattern.country,
      city: null,
      screenedAt: null,
      accountRef: null,
    },
    hit: {
      name: pattern.listed,
      aliases: pattern.aliases,
      entityType: null,
      dobs: pattern.dobs,
      placeOfBirth: null,
      countries: pattern.countries,
      nationality: [],
      category: null,
      allegation: null,
      notes: null,
      matchScore: null,
    },
    resolution: {
      hit_id: hitId,
      alert_id: "A-pattern",
      decision: pattern.decision,
      reason_code: pattern.reasonCode,
      customer_record_id: null,
      reason: "",
      evidence: [],
      comparison: null,
      closeness: null,
    },
    evidence: [],
    customerNote: "",
    groundsChecked: false,
    applicableCodes: [],
    customerMissing: false,
  };
}

function input(partial: Partial<BiasInput> & Pick<BiasInput, "decision">): BiasInput {
  return {
    customerName: null,
    hitNames: [],
    customerDob: null,
    hitDobs: [],
    hitDobKnown: true,
    customerCountries: [],
    hitCountries: [],
    hitCountryKnown: true,
    reasonCode: "",
    reason: "",
    ...partial,
  };
}

test("review and confirm scores use only the facts on the case", () => {
  const review = biasRiskForCase(briefCase("H-B10003"));
  const confirm = biasRiskForCase(briefCase("H-B10002"));
  assert.ok(review);
  assert.equal(review.total, 80);
  assert.equal(review.band, "High");
  assert.deepEqual(
    review.reasons.map((reason) => reason.points),
    [40, 30, 10],
  );
  assert.ok(confirm);
  assert.equal(confirm.total, 40);
  assert.equal(confirm.band, "Elevated");
  assert.deepEqual(
    confirm.reasons.map((reason) => reason.points),
    [40, 0, 0],
  );
  assert.equal(biasRiskForCase(briefCase("H-B10001")), null);
  assert.equal(biasRiskForCase(briefCase("H-B10004")), null);
});

test("a single common token with a missing date lets country stand in", () => {
  const score = scoreBias(
    input({
      decision: "REVIEW",
      customerName: "John",
      hitNames: ["John"],
      customerCountries: ["Canada"],
      hitCountries: ["Canada"],
    }),
  );
  assert.ok(score);
  assert.equal(score.total, 100);
  assert.equal(score.band, "High");
  assert.deepEqual(
    score.reasons.map((reason) => reason.points),
    [40, 30, 30],
  );
});

test("two distinctive parts that agree on date and country stay low", () => {
  const score = scoreBias(
    input({
      decision: "SAME_ENTITY",
      customerName: "Katherine Hoek",
      hitNames: ["Katherine Hoek"],
      customerDob: "1980-04-02",
      hitDobs: ["1980"],
      customerCountries: ["Canada"],
      hitCountries: ["Canada"],
    }),
  );
  assert.ok(score);
  assert.equal(score.total, 0);
  assert.equal(score.band, "Low");
});

test("a contradicting date is a weak candidate and a country clash is not a stand-in", () => {
  const score = scoreBias(
    input({
      decision: "REVIEW",
      customerName: "Katherine Hoek",
      hitNames: ["Katherine Hoek"],
      customerDob: "1980-04-02",
      hitDobs: ["1950"],
      customerCountries: ["Canada"],
      hitCountries: ["Japan"],
    }),
  );
  assert.ok(score);
  assert.equal(score.total, 10);
  assert.deepEqual(
    score.reasons.map((reason) => reason.points),
    [0, 10, 0],
  );
});

test("an unknown name with missing date and country is high and capped at 100", () => {
  const score = scoreBias(input({ decision: "REVIEW" }));
  assert.ok(score);
  assert.equal(score.total, 60);
  assert.equal(score.band, "High");
});

test("two common tokens are broad, and an agreeing date keeps country from standing in", () => {
  const score = scoreBias(
    input({
      decision: "SAME_ENTITY",
      customerName: "Maria Garcia",
      hitNames: ["Garcia, Maria"],
      customerDob: "1975",
      hitDobs: ["1975"],
      customerCountries: ["Spain"],
      hitCountries: ["Spain"],
    }),
  );
  assert.ok(score);
  assert.equal(score.total, 40);
  assert.deepEqual(
    score.reasons.map((reason) => reason.points),
    [40, 0, 0],
  );
});

test("nothing contradicts the hit is not a contradicting date of birth", () => {
  const score = scoreBias(
    input({
      decision: "SAME_ENTITY",
      customerName: "Katherine Hoek",
      hitNames: ["Katherine Hoek"],
      hitDobKnown: false,
      hitCountryKnown: false,
      reasonCode: "NAME_DOB_LOCATION_MATCH",
      reason:
        "The customer's date of birth 1980-04-02 agrees with the hit's 1980. Both the customer and the hit are linked to Canada. The customer's name agrees with the hit's name Katherine Hoek, and nothing in the records contradicts the hit.",
    }),
  );
  assert.ok(score);
  assert.deepEqual(
    score.reasons.map((reason) => reason.points),
    [0, 0, 0],
  );
  assert.equal(score.total, 0);
});

test("a development row uses the comparison the resolver already wrote", () => {
  const score = scoreBias(
    input({
      decision: "REVIEW",
      hitDobKnown: false,
      hitCountryKnown: false,
      reasonCode: "INSUFFICIENT_DATA",
      reason:
        "The customer's name agrees with the hit's name Chen, Long. Both the customer and the hit are linked to Canada. The date of birth cannot be compared with the hit, so nothing compared here is enough to clear the hit or to confirm it.",
    }),
  );
  assert.ok(score);
  assert.equal(score.reasons[0]?.points, 0);
  assert.equal(score.reasons[1]?.points, 30);
  assert.equal(score.reasons[2]?.points, 0);
  assert.equal(score.total, 30);
});
