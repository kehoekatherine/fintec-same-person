"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { ClosenessScore } from "@/components/case-assessment";
import { CustomerHitCompare, OtherMatching } from "@/components/customer-hit-compare";
import { DECISION_BADGE, DECISION_RULE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { biasRiskForExplanation } from "@/lib/bias-risk";
import { comparisonRows, CUSTOMER_FILE_ABSENT, type CaseFacts } from "@/lib/compare-rows";
import { actionFor, type Explanation } from "@/lib/explanation";
import { DECISION_LABEL, DECISION_MEANING, reasonLabel } from "@/lib/labels";
import { cn } from "cn";

export function CasePanel({ item, onBack }: { item: Explanation; onBack: () => void }) {
  const facts = useCaseFacts(item);
  const bias = biasRiskForExplanation(item);
  const rows = facts.data
    ? comparisonRows({
        packPresent: facts.data.packPresent,
        hitPresent: facts.data.hitPresent,
        customerInFile: facts.data.customerInFile,
        stored: item.comparison,
        core: facts.data.core,
        city: facts.data.city,
        entity: facts.data.entity,
      })
    : [];
  const message = facts.data ? caseMessage(facts.data) : facts.error;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <article data-testid="case-panel" className="border-t border-border px-4 py-4 text-foreground lg:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs break-all text-muted-foreground">
          {item.hitId}
          {item.alertId ? ` · ${item.alertId}` : ""}
        </p>
        <Button type="button" variant="outline" data-testid="case-back" className="h-10 px-3" onClick={onBack}>
          <X />
          Close
        </Button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
        {facts.data || facts.error ? null : (
          <p data-testid="case-facts-loading" className="text-sm text-muted-foreground">
            Reading the customer file…
          </p>
        )}
        {message ? (
          <p data-testid="customer-missing" className="text-sm text-foreground">
            {message}
          </p>
        ) : null}
        {rows.length > 0 ? <CustomerHitCompare rows={rows} /> : null}
        <OtherMatching lines={facts.data?.packPresent && facts.data.hitPresent ? facts.data.others : []} />
        </div>
        <div className="grid gap-5">
        <section
          aria-label="Conclusion"
          data-testid="conclusion"
          className={cn("border-y border-r border-l-4 border-border bg-card px-5 py-5", DECISION_RULE[item.decision])}
        >
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Conclusion</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="font-heading text-3xl text-foreground">{DECISION_LABEL[item.decision]}</p>
            {item.reasonCode ? (
              <Badge variant="outline" className={cn("h-6 font-mono", DECISION_BADGE[item.decision])}>
                {item.reasonCode}
              </Badge>
            ) : null}
          </div>
          {item.reasonCode ? <p className="mt-2 text-sm text-foreground">{reasonLabel(item.reasonCode)}</p> : null}
          <p className="mt-1 text-sm text-muted-foreground">{DECISION_MEANING[item.decision]}</p>
        </section>
        <section aria-label="Action" data-testid="action">
          <h3 className="font-heading text-2xl text-foreground">Action</h3>
          <p className="mt-1 text-base leading-7 text-foreground" data-testid="case-action">
            {actionFor(item.decision, item.customerRecordId)}
          </p>
        </section>
        {item.closeness ? <ClosenessScore closeness={item.closeness} /> : null}
        {bias ? <BiasRiskPanel score={bias} /> : null}
        </div>
      </div>
    </article>
  );
}

function caseMessage(facts: CaseFacts): string | null {
  if (!facts.packPresent) return CUSTOMER_FILE_ABSENT;
  return facts.customerMessage;
}

function useCaseFacts(item: Explanation): { data: CaseFacts | null; error: string | null } {
  const evidenceKey = item.evidenceIds.join("\n");
  const [data, setData] = useState<CaseFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState("");
  const nextScope = `${item.hitId}\n${item.alertId}\n${item.customerRecordId ?? ""}\n${evidenceKey}`;
  if (scope !== nextScope) {
    setScope(nextScope);
    setData(null);
    setError(null);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (item.hitId) params.set("hit", item.hitId);
    if (item.alertId) params.set("alert", item.alertId);
    if (item.customerRecordId) params.set("customer", item.customerRecordId);
    for (const id of item.evidenceIds) params.append("evidence", id);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/development/case?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json()) as { facts?: CaseFacts; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.facts) {
          setError(body.error || "The customer file could not be read.");
          return;
        }
        setData(body.facts);
      } catch {
        if (!cancelled) setError("The customer file could not be read.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidenceKey, item.alertId, item.customerRecordId, item.evidenceIds, item.hitId]);

  return { data, error };
}
