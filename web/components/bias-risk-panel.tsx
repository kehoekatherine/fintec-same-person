import type { BiasRisk } from "@/lib/bias-risk";
import { cn } from "cn";

const BAND_CLASS = {
  Low: "text-muted-foreground",
  Elevated: "text-review",
  High: "text-foreground",
} as const;

export function BiasRiskPanel({ score }: { score: BiasRisk }) {
  return (
    <section data-testid="bias-risk" aria-label="Bias risk" className="border border-border bg-card px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Bias risk</h3>
        <p className="font-heading text-3xl tabular-nums text-foreground" data-testid="bias-risk-total">
          {score.total}
          <span className="text-base font-normal text-muted-foreground"> / 100</span>
        </p>
      </div>
      <p className={cn("mt-1 text-sm font-medium", BAND_CLASS[score.band])} data-testid="bias-risk-band">
        {score.band}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground" data-testid="bias-risk-meaning">
        This is the risk that the match is unreliable because the name is common or a fact is missing, and it is
        not a score of criminality, nationality, religion, or ethnicity.
      </p>
      {score.band === "High" ? (
        <p className="mt-2 text-sm leading-6 text-foreground" data-testid="bias-risk-caution">
          Treat this match with more caution.
        </p>
      ) : null}
      <ul className="mt-4 grid gap-3">
        {score.reasons.map((reason) => (
          <li key={reason.id} data-testid={`bias-reason-${reason.id}`} className="text-sm leading-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-foreground">{reason.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">+{reason.points}</span>
            </div>
            <p className="text-muted-foreground">{reason.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
