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
    let parsed: Resolution;
    try {
      parsed = JSON.parse(line) as Resolution;
    } catch {
      throw new DeskError("A result line was not valid JSON.", { status: 500 });
    }
    if (!parsed.hit_id || !parsed.decision || !parsed.reason_code) {
      throw new DeskError("A result line was missing hit_id, decision, or reason_code.", {
        status: 500,
      });
    }
    if (!isDecision(parsed.decision)) {
      throw new DeskError(`A result line used an unknown decision: ${parsed.decision}.`, {
        status: 500,
      });
    }
    rows.push({
      hit_id: parsed.hit_id,
      alert_id: typeof parsed.alert_id === "string" ? parsed.alert_id : "",
      decision: parsed.decision,
      reason_code: parsed.reason_code,
      customer_record_id: parsed.customer_record_id ?? null,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((item): item is string => typeof item === "string")
        : [],
    });
  }
  return rows;
}
