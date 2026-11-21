import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseAssessment } from "@/components/case-assessment";
import { blank, formatWhen } from "@/lib/format";
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
          The queue lists every fictional case. Open one to read the screened customer, the
          watchlist hit, and the reason the resolver wrote.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function CaseBody({ item, onBack }: { item: DeskCase; onBack: () => void }) {
  const { resolution } = item;
  return (
    <article data-testid="case-view" className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {item.hitId} · {item.alertId}
          </p>
          <h2 className="mt-1 font-heading text-3xl leading-tight tracking-tight">{item.screened.name}</h2>
          <p className="mt-1 text-base text-muted-foreground">against {item.hit.name}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {resolution.customer_record_id ?? "No customer record"}
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground" data-testid="customer-note">
            {item.customerNote}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-10 shrink-0 px-3 lg:hidden" onClick={onBack}>
          <ArrowLeft />
          Queue
        </Button>
      </div>

      <CaseAssessment
        decision={resolution.decision}
        reasonCode={resolution.reason_code}
        reason={resolution.reason}
        comparison={resolution.comparison}
        closeness={resolution.closeness}
      >
        <section aria-label="Data sources" className="grid gap-3">
          <div>
            <h3 className="font-heading text-2xl">Data sources</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              These are fictional brief records. They are not looked up in the development customers.jsonl.
            </p>
          </div>
          {item.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">The resolver cited no record ids.</p>
          ) : (
            item.evidence.map((record) => (
              <Card key={record.id} className="bg-card" data-testid={`evidence-${record.id}`}>
                <CardHeader>
                  <CardDescription>
                    {record.kind} · {record.file}
                  </CardDescription>
                  <CardTitle className="font-mono text-base">{record.id}</CardTitle>
                </CardHeader>
                <CardContent>
                  {record.note ? <p className="mb-3 text-sm leading-6 text-foreground">{record.note}</p> : null}
                  <FactList rows={record.fields.map((field) => [field.label, field.value] as const)} />
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </CaseAssessment>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="bg-card">
          <CardHeader>
            <CardDescription>As the alert screened them</CardDescription>
            <CardTitle className="font-heading text-xl">{item.screened.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <FactList
              rows={[
                ["Entity", blank(item.screened.entityType)],
                ["Born", formatWhen(item.screened.dob)],
                ["Country", blank(item.screened.country)],
                ["City", blank(item.screened.city)],
                ["Screened", formatWhen(item.screened.screenedAt)],
                ["Account", blank(item.screened.accountRef)],
              ]}
            />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader>
            <CardDescription>Watchlist hit</CardDescription>
            <CardTitle className="font-heading text-xl">{item.hit.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <FactList
              rows={[
                ["Entity", blank(item.hit.entityType)],
                ...(item.hit.aliases.length ? [["Aliases", item.hit.aliases.join(", ")] as const] : []),
                ["Born", item.hit.dobs.length ? item.hit.dobs.map((dob) => formatWhen(dob)).join(", ") : "Not given"],
                ["Place of birth", blank(item.hit.placeOfBirth)],
                ["Countries", item.hit.countries.length ? item.hit.countries.join(", ") : "Not given"],
                ["Nationality", item.hit.nationality.length ? item.hit.nationality.join(", ") : "Not given"],
                ["Category", blank(item.hit.category)],
                ...(item.hit.allegation ? [["Allegation", item.hit.allegation] as const] : []),
              ]}
            />
            {item.hit.notes ? (
              <p className="text-sm leading-6 text-foreground/90">{item.hit.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">The hit has no profile notes.</p>
            )}
            {item.hit.matchScore != null ? (
              <p className="text-xs leading-5 text-muted-foreground">
                The screener&apos;s name score was {item.hit.matchScore}. The resolver does not use that number.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

    </article>
  );
}

function FactList({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
