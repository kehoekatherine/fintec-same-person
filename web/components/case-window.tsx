"use client";

import { Dialog } from "@base-ui/react/dialog";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { CaseComparison } from "@/components/case-comparison";
import { DevRecord } from "@/components/dev-record";
import { Button } from "@/components/ui/button";
import { biasRiskForExplanation } from "@/lib/bias-risk";
import { comparisonFromExplanation } from "@/lib/comparison";
import type { Explanation } from "@/lib/explanation";

export function CaseWindow({
  item,
  onClose,
}: {
  item: Explanation | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={item != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Popup
          data-testid="case-window"
          className="fixed top-1/2 left-1/2 z-50 max-h-[min(44rem,calc(100dvh-2rem))] w-[min(52rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-popover p-5 text-popover-foreground shadow-lg outline-none"
        >
          {item ? <ExplanationBody item={item} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ExplanationBody({ item }: { item: Explanation }) {
  const bias = biasRiskForExplanation(item);
  const model = comparisonFromExplanation(item);
  return (
    <article className="grid gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Dialog.Title className="font-mono text-xs text-muted-foreground">
            {item.hitId}
            {item.alertId ? ` · ${item.alertId}` : ""}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Customer and hit comparison</Dialog.Description>
        </div>
        <Dialog.Close
          data-testid="case-window-close"
          render={<Button type="button" variant="outline" className="h-10 shrink-0 px-3" />}
        >
          Close
        </Dialog.Close>
      </div>
      <CaseComparison model={model} />
      {bias ? <BiasRiskPanel score={bias} /> : null}
      {item.source === "row" ? (
        <DevRecord hitId={item.hitId} alertId={item.alertId} customerRecordId={item.customerRecordId} />
      ) : null}
    </article>
  );
}
