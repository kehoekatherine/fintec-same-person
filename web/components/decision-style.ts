import type { Decision } from "@/lib/types";

export const DECISION_BADGE: Record<Decision, string> = {
  DIFFERENT_ENTITY: "rounded-sm border border-clear/40 bg-clear/10 text-clear",
  SAME_ENTITY: "rounded-sm border border-confirm/40 bg-confirm/10 text-confirm",
  REVIEW: "rounded-sm border border-review/40 bg-review/15 text-review",
};

export const DECISION_RULE: Record<Decision, string> = {
  DIFFERENT_ENTITY: "border-l-clear",
  SAME_ENTITY: "border-l-confirm",
  REVIEW: "border-l-review",
};
