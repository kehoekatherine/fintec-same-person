import type { BiasRisk } from "./bias-risk.ts";
import type { Closeness, Decision } from "./types.ts";

/**
 * Confidence is how much weight the recorded facts can carry.
 * On a review or confirmation it is closeness after bias risk is taken off.
 * On a clearance it follows how direct the contradiction is.
 * It does not replace the decision, and it does not score a person.
 */

export type ConfidenceBand = "High" | "Moderate" | "Low";

export type Confidence = {
  total: number;
  band: ConfidenceBand;
  detail: string;
};

const CLEARANCE_CONFIDENCE: Record<string, { total: number; detail: string }> = {
  ENTITY_TYPE_MISMATCH: {
    total: 98,
    detail: "A person and a company cannot be the same entity.",
  },
  DECEASED: {
    total: 96,
    detail: "The listed party died before the screen.",
  },
  TEMPORAL_IMPOSSIBILITY: {
    total: 94,
    detail: "The customer was too young for the dated report.",
  },
  DOB_MISMATCH: {
    total: 90,
    detail: "The dates of birth contradict.",
  },
  NAME_MISMATCH_VERIFIED: {
    total: 82,
    detail: "A verified name does not match the hit.",
  },
  LOCATION_MISMATCH: {
    total: 74,
    detail: "The countries do not overlap.",
  },
};

export function confidenceBand(total: number): ConfidenceBand {
  if (total >= 80) return "High";
  if (total >= 50) return "Moderate";
  return "Low";
}

export function confidenceFor(input: {
  decision: Decision;
  reasonCode: string;
  closeness: Closeness | null;
  bias: BiasRisk | null;
}): Confidence {
  if (input.decision === "DIFFERENT_ENTITY") {
    const known = CLEARANCE_CONFIDENCE[input.reasonCode];
    if (known) return { total: known.total, band: confidenceBand(known.total), detail: known.detail };
    return {
      total: 60,
      band: "Moderate",
      detail: "The resolver cleared this hit. The contradiction is recorded in the reason.",
    };
  }
  if (!input.closeness || !input.bias) {
    return {
      total: 15,
      band: "Low",
      detail: "Closeness or bias risk was not recorded, so a person should look.",
    };
  }
  const total = Math.round((input.closeness.total * (100 - input.bias.total)) / 100);
  return {
    total,
    band: confidenceBand(total),
    detail: `Closeness ${input.closeness.total} with bias risk ${input.bias.total} taken off.`,
  };
}
