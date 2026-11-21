import { ArrowLeft } from "lucide-react";

import { CaseComparison } from "@/components/case-comparison";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { comparisonFromCase } from "@/lib/comparison";
import type { DeskCase } from "@/lib/types";
import { cn } from "cn";

export function CaseView({
  item,
  hidden,
  onBack,
  rechecked,
  absentCustomerIds,
}: {
  item: DeskCase | null;
  hidden: boolean;
  onBack: () => void;
  rechecked: boolean;
  absentCustomerIds: readonly string[] | null;
}) {
  return (
    <section className={cn("min-w-0", hidden && "hidden lg:block")} aria-label="Open case">
      {item ? (
        <CaseBody item={item} onBack={onBack} rechecked={rechecked} absentCustomerIds={absentCustomerIds} />
      ) : (
        <CasePlaceholder />
      )}
    </section>
  );
}

function CasePlaceholder() {
  return (
    <Card data-testid="case-placeholder" className="bg-card">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Choose a hit</CardTitle>
        <CardDescription className="text-sm leading-6">
          The queue lists every fictional case. Open one to compare the customer with the hit.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function CaseBody({
  item,
  onBack,
  rechecked,
  absentCustomerIds,
}: {
  item: DeskCase;
  onBack: () => void;
  rechecked: boolean;
  absentCustomerIds: readonly string[] | null;
}) {
  const model = comparisonFromCase(item, { rechecked, absentCustomerIds });
  return (
    <article data-testid="case-view" className="grid gap-4 border border-border bg-card px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {item.hitId} · {item.alertId}
        </p>
        <Button type="button" variant="outline" className="h-10 shrink-0 px-3 lg:hidden" onClick={onBack}>
          <ArrowLeft />
          Queue
        </Button>
      </div>
      <CaseComparison model={model} />
    </article>
  );
}
