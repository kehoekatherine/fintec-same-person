import { readCloseness, readComparison } from "@/lib/closeness";
import { DeskError } from "@/lib/errors";
import type { Decision, Resolution } from "@/lib/types";

const DECISIONS = new Set<Decision>(["DIFFERENT_ENTITY", "SAME_ENTITY", "REVIEW"]);

export function isDecision(value: string): value is Decision {
  return DECISIONS.has(value as Decision);
}

export function parseResolutions(text: string): Resolution[] {
  const rows: Resolution[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new DeskError("A result line was not valid JSON.", { status: 500 });
    }
    const hitId = typeof parsed.hit_id === "string" ? parsed.hit_id : "";
    const decision = typeof parsed.decision === "string" ? parsed.decision : "";
    const reasonCode = typeof parsed.reason_code === "string" ? parsed.reason_code : "";
    if (!hitId || !decision || !reasonCode) {
      throw new DeskError("A result line was missing hit_id, decision, or reason_code.", {
        status: 500,
      });
    }
    if (!isDecision(decision)) {
      throw new DeskError(`A result line used an unknown decision: ${decision}.`, {
        status: 500,
      });
    }
    const comparison = readComparison(parsed.comparison);
    rows.push({
      hit_id: hitId,
      alert_id: typeof parsed.alert_id === "string" ? parsed.alert_id : "",
      decision,
      reason_code: reasonCode,
      customer_record_id: typeof parsed.customer_record_id === "string" ? parsed.customer_record_id : null,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((item): item is string => typeof item === "string")
        : [],
      comparison,
      closeness: readCloseness(parsed.closeness, comparison, decision),
    });
  }
  return rows;
}
