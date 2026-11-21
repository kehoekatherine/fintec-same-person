import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { DECISION_BADGE, DECISION_RULE } from "@/components/decision-style";
import { sentences } from "@/lib/format";
import { DECISION_ACTION, DECISION_LABEL, DECISION_MEANING, reasonLabel } from "@/lib/labels";
import type { Closeness, Comparison, Decision, FactStatus } from "@/lib/types";
import { cn } from "cn";

const STATUS_LABEL: Record<FactStatus, string> = {
  match: "Match",
  different: "Different",
  undefined: "Undefined",
};

const FACTS: { key: keyof Comparison; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "country", label: "Country" },
];

export function CaseAssessment({
  decision,
  reasonCode,
  reason,
  comparison,
  closeness,
  children,
}: {
  decision: Decision;
  reasonCode: string;
  reason: string;
  comparison: Comparison | null;
  closeness: Closeness | null;
  children?: ReactNode;
}) {
  const lines = sentences(reason || "No reason was recorded.");
  return (
    <div className="grid gap-4">
      {comparison ? <ComparisonTable comparison={comparison} /> : null}
      <div className={cn("grid gap-4", closeness && "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start")}>
        <div className={cn("border-y border-r border-l-4 border-border bg-card px-5 py-5", DECISION_RULE[decision])}>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Conclusion</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="font-heading text-3xl text-foreground">{DECISION_LABEL[decision]}</p>
            {reasonCode ? (
              <Badge variant="outline" className={cn("h-6 font-mono", DECISION_BADGE[decision])}>
                {reasonCode}
              </Badge>
            ) : null}
          </div>
          {reasonCode ? <p className="mt-2 text-sm text-foreground">{reasonLabel(reasonCode)}</p> : null}
          <p className="mt-1 text-sm text-muted-foreground">{DECISION_MEANING[decision]}</p>
          <div className="mt-3 grid gap-3">
            {lines.map((line) => (
              <p key={line} className="text-base leading-7 text-foreground">
                {line}
              </p>
            ))}
          </div>
        </div>
        {closeness ? <ClosenessScore closeness={closeness} /> : null}
      </div>
      <section aria-label="Action">
        <h3 className="font-heading text-2xl">Action</h3>
        <p className="mt-1 text-base leading-7 text-foreground">{DECISION_ACTION[decision]}</p>
      </section>
      {children}
    </div>
  );
}

export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <section aria-label="Comparison" data-testid="comparison" className="border border-border bg-card">
      <h3 className="px-5 pt-4 font-heading text-2xl">Comparison</h3>
      <p className="px-5 pt-1 pb-3 text-sm leading-6 text-muted-foreground">
        Each fact is the value the resolver compared.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-t border-border text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-5 py-2 font-medium">Fact</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Hit</th>
              <th className="px-5 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {FACTS.map((fact) => {
              const row = comparison[fact.key];
              return (
                <tr key={fact.key} className="border-t border-border" data-testid={`compare-${fact.key}`}>
                  <th className="px-5 py-2 text-left font-medium text-foreground">{fact.label}</th>
                  <td className="px-3 py-2 break-words text-foreground">{row.customer}</td>
                  <td className="px-3 py-2 break-words text-foreground">{row.hit}</td>
                  <td className="px-5 py-2 text-foreground" data-testid={`compare-${fact.key}-status`}>
                    {STATUS_LABEL[row.status]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ClosenessScore({ closeness }: { closeness: Closeness }) {
  return (
    <aside
      aria-label="Closeness"
      data-testid="closeness"
      className="border border-border bg-card px-5 py-5"
    >
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Closeness</p>
      <p className="mt-2 font-heading text-3xl text-foreground tabular-nums" data-testid="closeness-total">
        {closeness.total}
      </p>
      <p className="text-sm text-foreground" data-testid="closeness-band">
        {closeness.band}
      </p>
      <dl className="mt-3 grid gap-1 text-sm">
        <ScorePart label="Name" value={closeness.name} testId="closeness-name" />
        <ScorePart label="Date of birth" value={closeness.dateOfBirth} testId="closeness-dob" />
        <ScorePart label="Country" value={closeness.country} testId="closeness-country" />
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Closeness of the name, date of birth, and country already compared.
      </p>
    </aside>
  );
}

export function ClosenessLine({ closeness, testId }: { closeness: Closeness; testId: string }) {
  return (
    <span data-testid={testId} className="text-xs leading-5 text-foreground">
      <span className="font-medium">Closeness {closeness.total}</span> {closeness.band}
      <span className="text-muted-foreground">
        {" "}
        · Name {closeness.name} · Date of birth {closeness.dateOfBirth} · Country {closeness.country}
      </span>
    </span>
  );
}

function ScorePart({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
