"use client";

import { Dialog } from "@base-ui/react/dialog";

import { BiasRiskPanel } from "@/components/bias-risk-panel";
import { DevRecord } from "@/components/dev-record";
import { DECISION_BADGE, DECISION_RULE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { biasRiskForExplanation } from "@/lib/bias-risk";
import { actionFor, customerFileMessage, groundsToShow, UNCHECKED_GROUNDS, type Explanation } from "@/lib/explanation";
import { blank, formatWhen, sentences } from "@/lib/format";
import { DECISION_LABEL, DECISION_MEANING, reasonLabel } from "@/lib/labels";
import { cn } from "cn";

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
  const lines = sentences(item.reason || "No reason was recorded.");
  const bias = biasRiskForExplanation(item);
  const codes = groundsToShow(item.reasonCode, item.groundsChecked, item.applicableCodes);
  const missing = customerFileMessage(item.customerRecordId, item.customerMissing);
  const customerTitle = item.customerName || item.hitId;
  const listed = item.listedName;
  return (
    <article className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {item.hitId}
            {item.alertId ? ` · ${item.alertId}` : ""}
          </p>
          <Dialog.Title className="mt-1 font-heading text-3xl leading-tight tracking-tight text-foreground">
            {customerTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-base text-muted-foreground">
            {listed ? `against ${listed}` : "Listed name was not loaded with this row."}
          </Dialog.Description>
        </div>
        <Dialog.Close
          data-testid="case-window-close"
          render={<Button type="button" variant="outline" className="h-10 shrink-0 px-3" />}
        >
          Close
        </Dialog.Close>
      </div>

      <div className={cn("border-y border-r border-l-4 border-border bg-card px-5 py-5", DECISION_RULE[item.decision])}>
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Decision</p>
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
        <p className="mt-3 text-base leading-6 text-foreground" data-testid="case-action">
          {actionFor(item.decision, item.customerRecordId)}
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Customer {item.customerRecordId ?? "not resolved"}
        </p>
        {missing ? (
          <p className="mt-2 text-sm text-foreground" data-testid="customer-missing">
            {missing}
          </p>
        ) : null}
        {item.customerNote ? <p className="mt-2 text-sm leading-6 text-foreground">{item.customerNote}</p> : null}
      </div>

      <section aria-label="Reason codes" className="grid gap-2" data-testid="case-grounds">
        <h3 className="font-heading text-2xl text-foreground">Reason codes</h3>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reason code was stored.</p>
        ) : (
          <ul className="grid gap-2">
            {codes.map((code) => {
              const used = code === item.reasonCode;
              return (
                <li
                  key={code}
                  data-testid={`ground-${code}`}
                  className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2"
                >
                  <span className="font-mono text-xs text-foreground">{code}</span>
                  <span className="text-sm text-muted-foreground">{reasonLabel(code)}</span>
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

      <div className="grid gap-3">
        {lines.map((line) => (
          <p key={line} className="text-base leading-7 text-foreground">
            {line}
          </p>
        ))}
      </div>

      {bias ? (
        <div data-testid="case-conclusion" className="grid items-start gap-3 md:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          <BiasRiskPanel score={bias} />
        </div>
      ) : null}

      {item.screened && item.hit ? (
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
      ) : (
        <Card className="bg-card">
          <CardHeader>
            <CardDescription>Names on this row</CardDescription>
            <CardTitle className="font-heading text-xl">{customerTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <FactList
              rows={[
                ["Customer", item.customerName ?? "Not loaded with this row"],
                ["Listed", item.listedName ?? "Not loaded with this row"],
                ...(item.customerDob ? [["Born", item.customerDob] as const] : []),
                ...(item.customerCountry ? [["Country", item.customerCountry] as const] : []),
              ]}
            />
          </CardContent>
        </Card>
      )}

      {!item.customerName && !item.screened ? (
        <p className="text-sm text-muted-foreground">Customer name was not loaded with this row.</p>
      ) : null}

      {item.source === "row" ? (
        <DevRecord hitId={item.hitId} alertId={item.alertId} customerRecordId={item.customerRecordId} />
      ) : null}

      <Separator />

      <section aria-label="Evidence" className="grid gap-3">
        <div>
          <h3 className="font-heading text-2xl text-foreground">Records that decided it</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.evidenceNote}</p>
        </div>
        {item.evidence && item.evidence.length > 0 ? (
          item.evidence.map((record) => (
            <Card key={record.id} className="bg-card" data-testid={`evidence-${record.id}`}>
              <CardHeader>
                <CardDescription>
                  {record.kind} · {record.file}
                </CardDescription>
                <CardTitle className="font-mono text-base">{record.id}</CardTitle>
              </CardHeader>
              <CardContent>
                <FactList rows={record.fields.map((field) => [field.label, field.value] as const)} />
              </CardContent>
            </Card>
          ))
        ) : item.evidenceIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence ids were recorded.</p>
        ) : (
          <ul className="grid gap-1">
            {item.evidenceIds.map((id) => (
              <li key={id} className="font-mono text-xs text-foreground">
                {id}
              </li>
            ))}
          </ul>
        )}
      </section>
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
