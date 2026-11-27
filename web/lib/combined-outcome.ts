import type { ClusterHit } from "./cluster-fit.ts";
import type { Decision, ResultRow } from "./types.ts";

const WORD: Record<Decision, string> = {
  DIFFERENT_ENTITY: "cleared",
  SAME_ENTITY: "confirmed",
  REVIEW: "review",
};

const DECISIONS = new Set<Decision>(["DIFFERENT_ENTITY", "SAME_ENTITY", "REVIEW"]);

function isDecision(value: string): value is Decision {
  return DECISIONS.has(value as Decision);
}

/** Keep the raw rules decision and use the combined outcome as the decision the desk shows. */
export function applyCombinedOutcome(rows: readonly ResultRow[], hits: readonly ClusterHit[]): ResultRow[] {
  const byId = new Map(hits.map((hit) => [hit.hitId, hit]));
  return rows.map((row) => {
    const hit = byId.get(row.hitId);
    const rules = row.decision;
    if (!hit || !isDecision(hit.combined) || hit.combined === rules) {
      return { ...row, rulesDecision: rules, escalatedToReview: false, escalationNote: null };
    }
    return {
      ...row,
      rulesDecision: rules,
      decision: hit.combined,
      escalatedToReview: true,
      escalationNote: `Rules: ${WORD[rules]} → escalated to review (k-means disagreement)`,
    };
  });
}
