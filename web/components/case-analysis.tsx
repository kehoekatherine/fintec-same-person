"use client";

import { useMemo, useState } from "react";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { ClosenessScore } from "@/components/case-assessment";
import { CustomerHitCompare } from "@/components/customer-hit-compare";
import { DECISION_BADGE, DECISION_RULE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { biasRiskForRow } from "@/lib/bias-risk";
import { comparisonRows, factsForRecordedComparison } from "@/lib/compare-rows";
import { actionFor } from "@/lib/explanation";
import { DECISION_LABEL, DECISION_MEANING, reasonLabel } from "@/lib/labels";
import { confidenceFor } from "@/lib/list-scores";
import type { ResultRow } from "@/lib/types";
import { cn } from "cn";

export function CaseAnalysis({
  rows,
  hitId,
  onHit,
}: {
  rows: ResultRow[];
  hitId: string | null;
  onHit: (hitId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterHits(rows, query), [query, rows]);
  const index = hitId ? rows.findIndex((row) => row.hitId === hitId) : -1;
  const row = index >= 0 ? rows[index] : null;

  return (
    <div data-testid="case-analysis" className="grid items-start gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="grid gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or hit"
          aria-label="Search hits"
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {rows.length} hits
        </p>
        <ul className="grid max-h-80 gap-1 overflow-auto lg:max-h-[calc(100dvh-16rem)]" aria-label="Hits">
          {filtered.map((item) => {
            const selected = item.hitId === hitId;
            return (
              <li key={item.hitId}>
                <button
                  type="button"
                  data-testid={`analysis-pick-${item.hitId}`}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "w-full border px-3 py-2 text-left",
                    selected ? "border-foreground bg-card" : "border-border bg-background",
                  )}
                  onClick={() => onHit(item.hitId)}
                >
                  <span className="block text-sm">{item.name ?? item.hitId}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.hitId}</span>
                    <Badge variant="outline" className={cn("h-5", DECISION_BADGE[item.decision])}>
                      {DECISION_LABEL[item.decision]}
                    </Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="grid gap-4">
        {row ? <OpenedHit row={row} index={index} total={rows.length} onHit={onHit} rows={rows} /> : <MissingHit hitId={hitId} />}
      </div>
    </div>
  );
}

function OpenedHit({
  row,
  index,
  total,
  rows,
  onHit,
}: {
  row: ResultRow;
  index: number;
  total: number;
  rows: ResultRow[];
  onHit: (hitId: string) => void;
}) {
  const facts = factsForRecordedComparison(row.comparison);
  const compared = comparisonRows({
    packPresent: facts.packPresent,
    hitPresent: facts.hitPresent,
    customerInFile: facts.customerInFile,
    stored: row.comparison,
    core: facts.core,
    city: facts.city,
    entity: facts.entity,
  });
  const bias = biasRiskForRow(row);
  const confidence = confidenceFor({
    decision: row.decision,
    reasonCode: row.reasonCode,
    closeness: row.closeness,
    bias,
  });
  const previous = index > 0 ? rows[index - 1] : null;
  const next = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null;

  return (
    <article className="grid gap-4" data-testid="analysis-case">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Hit {index + 1} of {total}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-10 px-3" disabled={!previous} onClick={() => previous && onHit(previous.hitId)}>
            Previous
          </Button>
          <Button type="button" variant="outline" className="h-10 px-3" disabled={!next} onClick={() => next && onHit(next.hitId)}>
            Next
          </Button>
        </div>
      </div>
      <section className={cn("grid gap-4 border border-border border-l-4 bg-card px-5 py-5 lg:grid-cols-2", DECISION_RULE[row.decision])}>
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{DECISION_LABEL[row.decision]}</p>
          <h2 className="mt-1 font-heading text-3xl">{row.name ?? "Name not recorded"}</h2>
          <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
            {row.hitId}
            {row.alertId ? ` · ${row.alertId}` : ""}
            {row.customerRecordId ? ` · ${row.customerRecordId}` : ""}
          </p>
          {row.listedName ? <p className="mt-2 text-sm text-muted-foreground">Listed as {row.listedName}</p> : null}
          <p className="mt-4 text-base leading-7" data-testid="analysis-action">
            {actionFor(row.decision, row.customerRecordId)}
          </p>
        </div>
        <div data-testid="analysis-why">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Why</h3>
          <Badge variant="outline" className={cn("mt-2 h-6 font-mono", DECISION_BADGE[row.decision])}>
            {row.reasonCode || "No code"}
          </Badge>
          <p className="mt-2 text-sm leading-6">{conclusionLine(row.reasonCode, row.decision)}</p>
          <p className="mt-2 text-sm leading-6" data-testid="analysis-reason">
            {row.reason || "No rule reason was recorded."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Rule reasoning. No model was called for this hit.</p>
        </div>
      </section>
      <section className="border border-border bg-card px-5 py-5" data-testid="analysis-compared">
        <h3 className="font-heading text-xl">Fields compared</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          There is no transaction statement on a watchlist hit. The resolver compared name, date of birth, and country.
          The customer source file is not published, so the evidence document text, city, and the rest of the customer
          record are not on this page.
        </p>
        <div className="mt-4">
          {compared.length > 0 ? <CustomerHitCompare rows={compared} /> : <p>This hit has no stored comparison.</p>}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-border bg-card px-4 py-4">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Closeness</h3>
          <div className="mt-2">
            {row.closeness ? (
              <ClosenessScore closeness={row.closeness} />
            ) : (
              <p className="text-sm leading-6">Cleared hits are not given a closeness score.</p>
            )}
          </div>
        </div>
        <div className="border border-border bg-card px-4 py-4">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Bias</h3>
          <div className="mt-2">{bias ? <BiasRiskPanel score={bias} /> : <p className="text-sm">No bias score on a cleared hit.</p>}</div>
        </div>
        <div className="border border-border bg-card px-4 py-4" data-testid="analysis-confidence">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Confidence</h3>
          <p className="mt-2 font-heading text-3xl">{confidence.total}</p>
          <p className="text-sm text-muted-foreground">{confidence.band}</p>
          <p className="mt-2 text-sm leading-6">{confidence.detail}</p>
        </div>
      </section>
      <section className="border border-border bg-card px-5 py-5" data-testid="analysis-evidence">
        <h3 className="font-heading text-xl">Evidence</h3>
        {row.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence ids were recorded.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {row.evidence.map((id) => (
              <li key={id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-mono text-xs">{id}</span>
                <span>{evidenceKind(id)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          These ids were written by the resolver. The files they point at are not in this published desk, so the page
          cannot open a note or a check.
        </p>
      </section>
    </article>
  );
}

function MissingHit({ hitId }: { hitId: string | null }) {
  return (
    <div className="border border-border bg-card px-5 py-6" data-testid="analysis-missing">
      <h2 className="font-heading text-2xl">{hitId ? "This hit is not in the run" : "Choose a hit"}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {hitId
          ? `${hitId} is not in the recorded development run.`
          : "Pick a hit from the list. The address keeps the view and the hit id."}
      </p>
    </div>
  );
}

function filterHits(rows: ResultRow[], query: string): ResultRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.hitId, row.alertId, row.customerRecordId, row.name, row.listedName, row.reasonCode, row.reason]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(needle)),
  );
}

function conclusionLine(reasonCode: string, decision: ResultRow["decision"]): string {
  const meaning = DECISION_MEANING[decision];
  if (!reasonCode) return meaning;
  const reason = reasonLabel(reasonCode);
  if (meaning.toLowerCase().startsWith(reason.toLowerCase())) return meaning;
  return `${reason}. ${meaning}`;
}

function evidenceKind(id: string): string {
  if (id.startsWith("CUS-")) return "customer record";
  if (id.startsWith("NOTE-")) return "note";
  if (id.startsWith("KYC-")) return "identity check";
  if (id.startsWith("SR-")) return "search result";
  if (id.startsWith("H-")) return "watchlist hit";
  if (id.startsWith("A-")) return "alert";
  return "record";
}
