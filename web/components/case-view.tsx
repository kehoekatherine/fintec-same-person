import { ArrowLeft } from "lucide-react";

import { CaseComparison } from "@/components/case-comparison";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { comparisonFromExplanation } from "@/lib/comparison";
import { explainCase } from "@/lib/explanation";
import type { DeskCase } from "@/lib/types";
import { cn } from "cn";

export function CaseView({
  item,
  hidden,
  onBack,
}: {
  item: DeskCase | null;
  hidden: boolean;
  onBack: () => void;
}) {
  return (
    <section className={cn("min-w-0", hidden && "hidden lg:block")} aria-label="Open case">
      {item ? <CaseBody item={item} onBack={onBack} /> : <CasePlaceholder />}
    </section>
  );
}

function CasePlaceholder() {
  return (
    <Card data-testid="case-placeholder" className="bg-card">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Choose a hit</CardTitle>
        <CardDescription className="text-sm leading-6">
          Open a hit to compare the customer with the listed person.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function CaseBody({ item, onBack }: { item: DeskCase; onBack: () => void }) {
  return (
    <article data-testid="case-view" className="grid gap-6">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {item.hitId} · {item.alertId}
        </p>
        <Button type="button" variant="outline" className="h-10 shrink-0 px-3 lg:hidden" onClick={onBack}>
          <ArrowLeft />
          Queue
        </Button>
      </div>
      <CaseComparison model={comparisonFromExplanation(explainCase(item))} />
    </article>
  );
}
