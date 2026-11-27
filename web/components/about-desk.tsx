"use client";

import { useEffect, useState, type ReactNode } from "react";

import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { DECISION_LABEL } from "@/lib/labels";
import { isMeasuredRun, type MeasuredRun } from "@/lib/measured-run";
import { publicUrl } from "@/lib/public-base";
import type { ResultRow } from "@/lib/types";
import { cn } from "cn";

export function AboutDesk({ rows, onHit }: { rows: ResultRow[]; onHit: (hitId: string) => void }) {
  const measured = useCostFile();
  const run = measured.status === "ready" ? measured.run : null;
  const total = run ? run.decisions.different + run.decisions.same + run.decisions.review : 0;

  return (
    <div data-testid="view-about" className="grid gap-4">
      <div>
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Watchlist Screening Desk</p>
        <h2 className="font-heading text-3xl">Hits on this run</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Decision mix for the recorded run in output/dev.jsonl. These counts are workload, not an official score.
          There is no label file, so this is not fitness or accuracy.
        </p>
      </div>
      {run && total > 0 ? (
        <>
          <div className="flex h-3 overflow-hidden border border-border" aria-hidden="true">
            <span className="bg-clear" style={{ width: `${(run.decisions.different / total) * 100}%` }} />
            <span className="bg-confirm" style={{ width: `${(run.decisions.same / total) * 100}%` }} />
            <span className="bg-review" style={{ width: `${(run.decisions.review / total) * 100}%` }} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-4" data-testid="about-counts">
            <Count value={String(run.hits)} label="Hits" />
            <Count value={String(run.decisions.different)} label="Clear" />
            <Count value={String(run.decisions.same)} label="Confirm" />
            <Count value={String(run.decisions.review)} label="Review" />
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {measured.status === "error" ? "The recorded counts could not be read." : "Reading the recorded run…"}
        </p>
      )}
      <ul className="grid max-h-72 gap-1 overflow-auto" aria-label="Hits on this run">
        {rows.map((row) => (
          <li key={row.hitId}>
            <button
              type="button"
              data-testid={`about-pick-${row.hitId}`}
              className="flex w-full flex-wrap items-center gap-2 border border-border bg-card px-3 py-2 text-left"
              onClick={() => onHit(row.hitId)}
            >
              <span className="text-sm">{row.name ?? row.hitId}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.hitId}</span>
              <Badge variant="outline" className={cn("h-5", DECISION_BADGE[row.decision])}>
                {DECISION_LABEL[row.decision]}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Guide title="What the Watchlist Screening Desk does" testId="about-what" open>
          <p>
            A bank screening system has already matched customers to watchlist profiles. Most of those matches share a
            name and little else. This desk shows, for each hit, whether the rules called the customer a different
            entity, the same entity, or a case a person should review. The reason cites the evidence ids the rules
            used. A contradiction clears the hit. Agreement on the required facts confirms it. Everything else stays
            for review. The rules make that decision. A model does not.
          </p>
          <p className="mt-2">
            The published desk shows the 819 recorded lines in output/dev.jsonl. It does not include the customer
            source files, and it does not call a model. system/README.md describes an optional check that can only
            hold a clearance the rules already made. That check is off here.
          </p>
        </Guide>
        <Guide title="How to use it" testId="about-use">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open Case analysis. The recorded hits load on their own.</li>
            <li>
              Click a hit in that list, or one of the hits above. The row stays highlighted. The address keeps the
              view and the hit id, so a link and the back button land on the same hit.
            </li>
            <li>Read the fields compared, the reason, and the action before you do anything else.</li>
            <li>
              The counts above are only this recorded run. Model cost holds the prices, one section at a time. A file
              that already has a decision on every row can be added from Case analysis. Scoring a new folder needs the
              local desk.
            </li>
          </ol>
        </Guide>
        <Guide title="How to read a case" testId="about-read">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Fields compared.</strong> Name, date of birth, and country, each Match, Different, or Undefined.
              There is no transaction statement. The customer file is not published, so the evidence text is not on
              the page.
            </li>
            <li>
              <strong>Clear.</strong> Different person. The hit can be cleared. The alert stays open until every hit
              on it is cleared.
            </li>
            <li>
              <strong>Confirm.</strong> Same person or company. Do not clear it.
            </li>
            <li>
              <strong>Review.</strong> Not enough to decide. A person looks. Do not clear it.
            </li>
            <li>
              <strong>Reason code and evidence ids.</strong> The rule that won, and the record ids that decided the
              hit. Closeness is shown on a review or a confirmation. A cleared hit has no closeness score.
            </li>
          </ul>
          <p className="mt-2">
            system/README.md uses four patterns to show the rules. They are not rows in the development file, and this
            desk does not open them as hits.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Mohammed Ali, born 1988 in London, against Mohamed Ali, born 1952 in Cairo: the years contradict, so the hit is cleared (`DOB_MISMATCH`).</li>
            <li>Li Wei, born 1975 in Singapore, against Wei Li, born 1975 in Singapore: name, year, and country agree, so the hit is confirmed (`NAME_DOB_LOCATION_MATCH`).</li>
            <li>Anna K. Petrova, with no date of birth, against Anna Petrova, born 1969 in Moscow: not enough to decide (`INSUFFICIENT_DATA`).</li>
            <li>Tom Okafor, born 2004, against a fraud report dated 2011: under 16 at that report, so the hit is cleared (`TEMPORAL_IMPOSSIBILITY`).</li>
          </ul>
        </Guide>
        <Guide title="The rules, in brief" testId="about-rules">
          <p>
            `system/run` calls `resolve.py`. It is Python 3, standard library only. It groups records that are the
            same person, compares the hit with the customer, and takes the first matching ground. system/README.md
            records a development run of these 819 hits at about eight seconds on one core, and says running it again
            writes the same file. The published JSONL itself has no clock.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Person against company: clear (`ENTITY_TYPE_MISMATCH`).</li>
            <li>Died before the screen: clear (`DECEASED`).</li>
            <li>Under 16 at the earliest dated report, or a company incorporated after it: clear (`TEMPORAL_IMPOSSIBILITY`).</li>
            <li>Every birth date contradicts: clear (`DOB_MISMATCH`).</li>
            <li>A verified legal name agrees with none of the hit’s names: clear (`NAME_MISMATCH_VERIFIED`).</li>
            <li>Countries do not overlap, and name and date do not both agree: clear (`LOCATION_MISMATCH`).</li>
            <li>Name, date, and a shared country: confirm (`NAME_DOB_LOCATION_MATCH`).</li>
            <li>Name and date agree, and a country is missing on one side: confirm (`NAME_DOB_MATCH`).</li>
            <li>A company whose name and country agree: confirm (`NAME_LOCATION_MATCH`).</li>
            <li>Nothing else decides it: review (`INSUFFICIENT_DATA`). No resolved customer is also a review. Several customers who disagree are `AMBIGUOUS_CUSTOMER_RECORD`.</li>
          </ol>
          <p className="mt-2">
            Closeness, on a review or a confirmation, is name 40, date of birth 30, and country 30 when they agree.
            An unsettled fact scores 15, 10, and 10. A contradiction scores 0. 80–100 is Close, 40–79 is Partial, and
            0–39 is Distant.
          </p>
        </Guide>
        <Guide title="Model cost, in brief" testId="about-cost">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Fitness</strong> would be how much of the review-everything cost the run saves. A true same-entity
              or true review hit cleared as different costs 60. Fitness, accuracy, unsafe clearance, and overfitting
              are unavailable: this repository has no label file.
            </li>
            <li>
              <strong>Language-model prices</strong> are published token rates, the same card as the alert-triage desk,
              checked 26 Nov 2026 (DeepSeek 27 Nov 2026). No language model was run on these hits. Input size is the
              characters in each recorded line, divided by 4.
            </li>
            <li>
              <strong>The rules</strong> in system/resolve.py are what wrote the decisions. Token cost of that run is
              zero.
            </li>
            <li>
              <strong>Unsupervised linkage</strong> (Fellegi–Sunter weights estimated without labels, then clustering)
              is described on Model cost. It was not run. It would be CPU only, £0 per decision, like the rules, and
              accuracy still cannot be measured without labels.
            </li>
          </ul>
        </Guide>
      </div>
    </div>
  );
}

function Guide({
  title,
  testId,
  open = false,
  children,
}: {
  title: string;
  testId: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="border border-border bg-card" data-testid={testId}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{title}</summary>
      <div className="border-t border-border px-4 py-3 text-sm leading-6">{children}</div>
    </details>
  );
}

function Count({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-card px-3 py-3">
      <p className="font-heading text-2xl">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function useCostFile(): { status: "loading" | "error" } | { status: "ready"; run: MeasuredRun } {
  const [state, setState] = useState<{ status: "loading" | "error" } | { status: "ready"; run: MeasuredRun }>({
    status: "loading",
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(publicUrl("/demo/cost.json"), { cache: "no-store" });
        const body = (await response.json()) as unknown;
        if (cancelled) return;
        if (!response.ok || !isMeasuredRun(body)) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", run: body });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
