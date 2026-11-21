import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { biasRiskForCase, scoreBias, type BiasInput } from "./bias-risk.ts";
import type { DeskCase } from "./types.ts";

const fixture = path.join(import.meta.dirname, "..", "fixtures", "brief");

function lines(file: string): Record<string, unknown>[] {
  return readFileSync(path.join(fixture, file), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function briefCase(hitId: string): DeskCase {
  const resolution = lines("resolved.jsonl").find((row) => row.hit_id === hitId);
  const alert = lines("alerts.jsonl").find((row) => row.alert_id === resolution?.alert_id);
  const hit = lines("hits.jsonl").find((row) => row.hit_id === hitId);
  const customer = (alert?.customer ?? {}) as Record<string, unknown>;
  if (!resolution || !hit) throw new Error(`missing ${hitId}`);
  return {
    hitId,
    alertId: String(resolution.alert_id),
    screened: {
      name: String(customer.name ?? ""),
      entityType: null,
      dob: typeof customer.dob === "string" ? customer.dob : null,
      country: typeof customer.country === "string" ? customer.country : null,
      city: null,
      screenedAt: null,
      accountRef: null,
    },
    hit: {
      name: String(hit.name ?? ""),
      aliases: Array.isArray(hit.aliases) ? hit.aliases.filter((item): item is string => typeof item === "string") : [],
      entityType: null,
      dobs: Array.isArray(hit.dobs) ? hit.dobs.filter((item): item is string => typeof item === "string") : [],
      placeOfBirth: null,
      countries: Array.isArray(hit.countries)
        ? hit.countries.filter((item): item is string => typeof item === "string")
        : [],
      nationality: [],
      category: null,
      allegation: null,
      notes: null,
      matchScore: null,
    },
    resolution: {
      hit_id: hitId,
      alert_id: String(resolution.alert_id),
      decision: resolution.decision as DeskCase["resolution"]["decision"],
      reason_code: String(resolution.reason_code),
      customer_record_id: typeof resolution.customer_record_id === "string" ? resolution.customer_record_id : null,
      reason: String(resolution.reason),
      evidence: [],
    },
    evidence: [],
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

test("brief review and confirm scores use only the facts on the case", () => {
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
