"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { ClosenessScore } from "@/components/case-assessment";
import { CaseComparison } from "@/components/case-comparison";
import { DevRecord } from "@/components/dev-record";
import { Button } from "@/components/ui/button";
import { biasRiskForExplanation } from "@/lib/bias-risk";
import { comparisonFromExplanation } from "@/lib/comparison";
import type { Explanation } from "@/lib/explanation";

export function CasePanel({ item, onBack }: { item: Explanation; onBack: () => void }) {
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 1023px)");
    if (narrow.matches) backRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !narrow.matches) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item.hitId, onBack]);

  return (
    <article data-testid="case-panel" className="min-h-full text-foreground">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3 lg:hidden">
        <Button
          ref={backRef}
          type="button"
          variant="outline"
          data-testid="case-back"
          className="h-10 px-3"
          onClick={onBack}
        >
          <ArrowLeft />
          Back
        </Button>
      </div>
      <div className="px-4 py-4 lg:px-5 lg:py-5">
        <ExplanationBody item={item} />
      </div>
    </article>
  );
}

function ExplanationBody({ item }: { item: Explanation }) {
  const bias = biasRiskForExplanation(item);
  return (
    <div className="grid gap-6">
      <p className="font-mono text-xs break-all text-muted-foreground">
        {item.hitId}
        {item.alertId ? ` · ${item.alertId}` : ""}
      </p>
      <CaseComparison model={comparisonFromExplanation(item)} />
      {item.closeness ? <ClosenessScore closeness={item.closeness} /> : null}
      {bias ? <BiasRiskPanel score={bias} /> : null}
      {item.source === "row" ? (
        <DevRecord hitId={item.hitId} alertId={item.alertId} customerRecordId={item.customerRecordId} />
      ) : null}
    </div>
  );
}
