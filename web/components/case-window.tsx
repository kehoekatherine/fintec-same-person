"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { ClosenessScore, ComparisonTable } from "@/components/case-assessment";
import { DevRecord } from "@/components/dev-record";
import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { biasRiskForExplanation } from "@/lib/bias-risk";
import { actionFor, customerFileMessage, groundsToShow, UNCHECKED_GROUNDS, type Explanation } from "@/lib/explanation";
import { blank, formatWhen, sentences } from "@/lib/format";
import { DECISION_LABEL, DECISION_MEANING, reasonLabel } from "@/lib/labels";
import { cn } from "cn";

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
  const lines = sentences(item.reason || "No reason was recorded.");
  const bias = biasRiskForExplanation(item);
  const codes = groundsToShow(item.reasonCode, item.groundsChecked, item.applicableCodes);
  const missing = customerFileMessage(item.customerRecordId, item.customerMissing);
  const customerTitle = item.customerName || item.hitId;
  const listed = item.listedName;
  const conclusion = item.reasonCode
    ? `${DECISION_LABEL[item.decision]} — ${reasonLabel(item.reasonCode)}. ${DECISION_MEANING[item.decision]}`
    : `${DECISION_LABEL[item.decision]}. ${DECISION_MEANING[item.decision]}`;
  const compared = comparisonRows(item);
  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <p className="font-mono text-xs break-all text-muted-foreground">
          {item.hitId}
          {item.alertId ? ` · ${item.alertId}` : ""}
        </p>
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Decision</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl leading-tight text-foreground">{customerTitle}</h2>
          <Badge className={cn("h-6 px-2", DECISION_BADGE[item.decision])}>{DECISION_LABEL[item.decision]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {listed ? `against ${listed}` : "Listed name was not loaded with this row."}
        </p>
        {item.reasonCode ? <p className="font-mono text-xs text-muted-foreground">{item.reasonCode}</p> : null}
        {missing ? (
          <p className="text-sm text-foreground" data-testid="customer-missing">
            {missing}
          </p>
        ) : null}
        {item.customerNote ? <p className="text-sm leading-6 text-foreground">{item.customerNote}</p> : null}
      </header>

      <section aria-label="Customer compared with the hit" data-testid="case-comparison">
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Customer and hit</h3>
        <table className="mt-2 w-full border-collapse text-sm">
          <caption className="sr-only">Customer compared with the hit</caption>
          <thead>
            <tr className="border-b border-border bg-muted text-left">
              <th scope="col" className="w-[5.5rem] px-2 py-2 font-medium text-muted-foreground">
                <span className="sr-only">Field</span>
              </th>
              <th scope="col" className="px-2 py-2 font-medium text-foreground">
                Customer
              </th>
              <th scope="col" className="px-2 py-2 font-medium text-foreground">
                Hit
              </th>
            </tr>
          </thead>
          <tbody>
            {compared.map((row) => (
              <tr key={row.label} className="border-b border-border align-top last:border-b-0">
                <th scope="row" className="px-2 py-2 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                <td className="px-2 py-2 break-words text-foreground">{row.customer}</td>
                <td className="px-2 py-2 break-words text-foreground">{row.hit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {item.hit?.notes ? <p className="mt-2 text-sm leading-6 text-foreground">{item.hit.notes}</p> : null}
        {item.hit && !item.hit.notes ? <p className="mt-2 text-sm text-muted-foreground">The hit has no profile notes.</p> : null}
        {item.hit?.matchScore != null ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The screener&apos;s name score was {item.hit.matchScore}. The resolver does not use that number.
          </p>
        ) : null}
        {!item.customerName && !item.screened ? (
          <p className="mt-2 text-sm text-muted-foreground">Customer name was not loaded with this row.</p>
        ) : null}
      </section>

      <section data-testid="case-conclusion">
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Conclusion</h3>
        <p className="mt-1 text-sm leading-6 text-foreground">{conclusion}</p>
        <div className="mt-2 grid gap-2">
          {lines.map((line) => (
            <p key={line} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Action</h3>
        <p className="mt-1 text-sm leading-6 text-foreground" data-testid="case-action">
          {actionFor(item.decision, item.customerRecordId)}
        </p>
      </section>

      {bias ? <BiasRiskPanel score={bias} /> : null}

      {item.comparison ? <ComparisonTable comparison={item.comparison} /> : null}
      {item.closeness ? <ClosenessScore closeness={item.closeness} /> : null}

      <section aria-label="Reason codes" className="grid gap-2" data-testid="case-grounds">
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Reason codes</h3>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reason code was stored.</p>
        ) : (
          <ul className="grid gap-2">
            {codes.map((code) => {
              const used = code === item.reasonCode;
              return (
                <li key={code} data-testid={`ground-${code}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-mono text-xs text-foreground">{code}</span>
                  <span className="text-muted-foreground">{reasonLabel(code)}</span>
                  {used ? (
                    <Badge variant="outline" className="h-6" data-testid="ground-used">
                      Ground used
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {item.groundsChecked ? null : (
          <p className="text-sm text-muted-foreground" data-testid="grounds-unchecked">
            {UNCHECKED_GROUNDS}
          </p>
        )}
      </section>

      {item.source === "row" ? (
        <DevRecord hitId={item.hitId} alertId={item.alertId} customerRecordId={item.customerRecordId} />
      ) : null}

      <section aria-label="Evidence" className="grid gap-2" data-testid="sources">
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Evidence</h3>
        <p className="text-sm leading-6 text-muted-foreground">{item.evidenceNote}</p>
        {item.evidence && item.evidence.length > 0 ? (
          <ul className="grid gap-3">
            {item.evidence.map((record) => (
              <li key={record.id} data-testid={`evidence-${record.id}`} className="border-b border-border pb-3 last:border-b-0">
                <p className="font-mono text-sm break-all text-foreground">{record.id}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {record.kind} · {record.file}
                </p>
                <dl className="mt-2 grid gap-1">
                  {record.fields.map((field) => (
                    <div key={field.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-sm">
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd className="min-w-0 break-words text-foreground">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        ) : item.evidenceIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence ids were recorded.</p>
        ) : (
          <ul className="grid gap-1">
            {item.evidenceIds.map((id) => (
              <li key={id} className="font-mono text-sm break-all text-foreground">
                {id}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function comparisonRows(item: Explanation): { label: string; customer: string; hit: string }[] {
  if (item.screened && item.hit) {
    const rows = [
      { label: "Name", customer: item.screened.name, hit: item.hit.name },
      { label: "Entity", customer: blank(item.screened.entityType), hit: blank(item.hit.entityType) },
      {
        label: "Born",
        customer: formatWhen(item.screened.dob),
        hit: item.hit.dobs.length ? item.hit.dobs.map((dob) => formatWhen(dob)).join(", ") : "Not given",
      },
      {
        label: "Country",
        customer: blank(item.screened.country),
        hit: item.hit.countries.length ? item.hit.countries.join(", ") : "Not given",
      },
      { label: "Place", customer: blank(item.screened.city), hit: blank(item.hit.placeOfBirth) },
    ];
    if (item.hit.aliases.length) rows.push({ label: "Aliases", customer: "Not given", hit: item.hit.aliases.join(", ") });
    if (item.hit.nationality.length) {
      rows.push({ label: "Nationality", customer: "Not given", hit: item.hit.nationality.join(", ") });
    }
    if (item.hit.category) rows.push({ label: "Category", customer: "Not given", hit: item.hit.category });
    if (item.hit.allegation) rows.push({ label: "Allegation", customer: "Not given", hit: item.hit.allegation });
    if (item.screened.accountRef) rows.push({ label: "Account", customer: item.screened.accountRef, hit: "Not given" });
    if (item.screened.screenedAt) {
      rows.push({ label: "Screened", customer: formatWhen(item.screened.screenedAt), hit: "Not given" });
    }
    return rows;
  }
  return [
    { label: "Name", customer: item.customerName ?? "Not given", hit: item.listedName ?? "Not given" },
    {
      label: "Born",
      customer: item.customerDob ? formatWhen(item.customerDob) : "Not given",
      hit: "Not in this run",
    },
    { label: "Country", customer: item.customerCountry ?? "Not given", hit: "Not in this run" },
    { label: "Record", customer: item.customerRecordId ?? "Not resolved", hit: item.hitId },
  ];
}
