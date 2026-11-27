"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClusterFit } from "@/components/use-cluster-fit";
import type { ClusterFit } from "@/lib/cluster-fit";
import type { CostSection } from "@/lib/desk-view";
import { isMeasuredRun, type MeasuredRun } from "@/lib/measured-run";
import { CURRENCY_NOTE, MODEL_PRICES, OUTPUT_TOKENS_NOTE, PRICE_CHECKED, caseUsd, type ModelPrice } from "@/lib/model-prices";
import { publicUrl } from "@/lib/public-base";
import { DECISION_COST } from "@/lib/run-metrics";
import { reasonLabel } from "@/lib/labels";

const SECTIONS: { id: CostSection; label: string }[] = [
  { id: "models", label: "Language models" },
  { id: "unsupervised", label: "Unsupervised / clustering" },
  { id: "risk", label: "Risk" },
];

export function ModelCost({
  section,
  onSection,
}: {
  section: CostSection;
  onSection: (section: CostSection) => void;
}) {
  const measured = useMeasuredRun();
  return (
    <div data-testid="view-cost" className="grid gap-4">
      <div>
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Watchlist Screening Desk</p>
        <h2 className="font-heading text-3xl">Model cost</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          One section at a time. List prices were read from provider pages on {PRICE_CHECKED}, the same card as the
          alert-triage desk. No language model was called on these hits.
        </p>
      </div>
      <div role="tablist" aria-label="Model cost sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => {
          const selected = section === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              role="tab"
              variant={selected ? "default" : "outline"}
              aria-selected={selected}
              data-testid={`cost-tab-${item.id}`}
              className="h-10 px-3"
              onClick={() => onSection(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
      {measured.status === "loading" ? <p className="text-sm text-muted-foreground">Reading the recorded run…</p> : null}
      {measured.status === "error" ? (
        <p className="text-sm" data-testid="cost-error">
          The measured run could not be read. Token figures stay blank rather than being guessed.
        </p>
      ) : null}
      {measured.status === "ready" && section === "models" ? <LanguageModels run={measured.run} /> : null}
      {measured.status === "ready" && section === "unsupervised" ? <Unsupervised run={measured.run} /> : null}
      {measured.status === "ready" && section === "risk" ? <Risk run={measured.run} /> : null}
    </div>
  );
}

function LanguageModels({ run }: { run: MeasuredRun }) {
  const [outputTokens, setOutputTokens] = useState(400);
  const [gbpPerUsd, setGbpPerUsd] = useState(0.79);
  const [monthly, setMonthly] = useState(run.hits);
  const rows = useMemo(
    () =>
      MODEL_PRICES.map((model) => ({
        model,
        usd: caseUsd(run.inputTokensMean, outputTokens, model),
        gbp: caseUsd(run.inputTokensMean, outputTokens, model) * gbpPerUsd,
        seconds: outputTokens / model.assumedOutputTokensPerSec,
      })),
    [gbpPerUsd, outputTokens, run.inputTokensMean],
  );
  const maxGbp = Math.max(...rows.map((row) => row.gbp * 1000), 0.01);
  const maxSeconds = Math.max(...rows.map((row) => row.seconds * 200), 1);

  return (
    <section data-testid="cost-models" className="grid gap-4">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{CURRENCY_NOTE}</p>
      <div className="grid gap-3 border border-border bg-card px-4 py-4 sm:grid-cols-3">
        <NumberField
          label="Output tokens per hit (assumption)"
          value={outputTokens}
          min={50}
          max={2000}
          step={10}
          onChange={setOutputTokens}
        />
        <NumberField
          label="GBP per 1 USD (assumption)"
          value={gbpPerUsd}
          min={0.5}
          max={1.2}
          step={0.01}
          onChange={setGbpPerUsd}
        />
        <NumberField
          label="Hits per month (the recorded run is the default)"
          value={monthly}
          min={1}
          max={50000}
          step={1}
          onChange={setMonthly}
        />
      </div>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{OUTPUT_TOKENS_NOTE}</p>
      <dl className="grid gap-3 sm:grid-cols-4" data-testid="measured-tokens">
        <Stat value={String(run.hits)} label="Recorded hits" note="output/dev.jsonl" />
        <Stat value={String(run.inputTokensMean)} label="Input tokens, mean" note="chars ÷ 4" />
        <Stat value={String(run.inputTokensP90)} label="Input tokens, p90" note="same estimate" />
        <Stat value={String(run.reasonTokensMean)} label="Reason tokens, mean" note="the rules text" />
      </dl>
      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">USD / 1M in</th>
              <th className="px-3 py-2 font-medium">USD / 1M out</th>
              <th className="px-3 py-2 font-medium">Per hit</th>
              <th className="px-3 py-2 font-medium">Per 1,000</th>
              <th className="px-3 py-2 font-medium">Per this run</th>
              <th className="px-3 py-2 font-medium">Per month</th>
              <th className="px-3 py-2 font-medium">Latency / hit</th>
              <th className="px-3 py-2 font-medium">200 hits vs 30 min</th>
              <th className="px-3 py-2 font-medium">Measured accuracy</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-3 py-2">
                <strong>Rules engine</strong>
                <div className="text-xs text-muted-foreground">No tokens. system/resolve.py</div>
              </td>
              <td className="px-3 py-2">0</td>
              <td className="px-3 py-2">0</td>
              <td className="px-3 py-2">{gbp(0, 4)}</td>
              <td className="px-3 py-2">{gbp(0)}</td>
              <td className="px-3 py-2">{gbp(0)}</td>
              <td className="px-3 py-2">{gbp(0)}</td>
              <td className="px-3 py-2">Not measured</td>
              <td className="px-3 py-2">Not measured</td>
              <td className="px-3 py-2">No labels in this repository</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.model.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <strong>{row.model.label}</strong>
                  <div className="text-xs text-muted-foreground">{row.model.provider}</div>
                </td>
                <td className="px-3 py-2">{usd(row.model.inputUsdPerMtok)}</td>
                <td className="px-3 py-2">{usd(row.model.outputUsdPerMtok)}</td>
                <td className="px-3 py-2">{gbp(row.gbp, 4)}</td>
                <td className="px-3 py-2">{gbp(row.gbp * 1000)}</td>
                <td className="px-3 py-2">{gbp(row.gbp * run.hits)}</td>
                <td className="px-3 py-2">{gbp(row.gbp * monthly)}</td>
                <td className="px-3 py-2">{latency(row.seconds, row.model)}</td>
                <td className="px-3 py-2">{twoHundred(row.seconds)}</td>
                <td className="px-3 py-2">Not measured</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="GBP per 1,000 hits"
          rows={rows.map((row) => ({ label: row.model.chartLabel, value: row.gbp * 1000, max: maxGbp }))}
          format={(value) => gbp(value)}
        />
        <BarChart
          title="Minutes for 200 hits"
          note="Language-model bars use the speed assumption or the published tokens per second. The rules engine has no clock on this run, so it is not on this chart."
          rows={rows.map((row) => ({ label: row.model.chartLabel, value: (row.seconds * 200) / 60, max: maxSeconds / 60 }))}
          format={(value) => `${value.toFixed(1)} min`}
        />
      </div>
      <h3 className="font-heading text-xl">Tradeoffs</h3>
      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Option</th>
              <th className="px-3 py-2 font-medium">Accuracy on these hits</th>
              <th className="px-3 py-2 font-medium">Determinism</th>
              <th className="px-3 py-2 font-medium">Data leaving this desk</th>
              <th className="px-3 py-2 font-medium">Cost per 1,000</th>
              <th className="px-3 py-2 font-medium">Time for 200</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border align-top">
              <th className="px-3 py-2 text-left font-medium">Rules engine</th>
              <td className="px-3 py-2">No labels, so accuracy is unavailable.</td>
              <td className="px-3 py-2">The resolver is a fixed rule order.</td>
              <td className="px-3 py-2">The published desk does not call a model.</td>
              <td className="px-3 py-2">{gbp(0)}</td>
              <td className="px-3 py-2">Not measured</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.model.id} className="border-t border-border align-top">
                <th className="px-3 py-2 text-left font-medium">{row.model.label}</th>
                <td className="px-3 py-2">Not measured. An empty cell is not a score.</td>
                <td className="px-3 py-2">Not guaranteed. No run was made.</td>
                <td className="px-3 py-2">{privacy(row.model)}</td>
                <td className="px-3 py-2">{gbp(row.gbp * 1000)} at the sliders above.</td>
                <td className="px-3 py-2">{twoHundred(row.seconds)}. {row.model.speedNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-6 text-muted-foreground" data-testid="cost-method">
        {run.method} Mean recorded line {Math.round(run.charsMean)} characters, about {run.inputTokensMean} tokens.
        Reasons average {Math.round(run.reasonCharsMean)} characters, about {run.reasonTokensMean} tokens. Resolver time
        is not in the file.
      </p>
      <h3 className="font-heading text-xl">Sources</h3>
      <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6">
        {MODEL_PRICES.map((model) => (
          <li key={model.id}>
            <a className="underline" href={model.source}>
              {model.label}
            </a>
            . {model.sourceNote}
          </li>
        ))}
      </ol>
    </section>
  );
}

const CLUSTER_COLOURS = ["#1d4e89", "#9f1239", "#0c7a43", "#b45309", "#6d28d9", "#0f766e", "#365314", "#0369a1"];

function Unsupervised({ run }: { run: MeasuredRun }) {
  const fitted = useClusterFit();
  return (
    <section data-testid="cost-unsupervised" className="grid gap-4">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        A k-means model was fitted to the {run.hits} stored comparisons. The rules decision was not a feature. This
        repository has no label file, so accuracy cannot be measured. The cross-tab below is a comparison, not a score.
      </p>
      {fitted.status === "loading" ? <p className="text-sm text-muted-foreground">Reading the clustering…</p> : null}
      {fitted.status === "error" ? (
        <p className="text-sm">The clustering file could not be read. No silhouette is shown in its place.</p>
      ) : null}
      {fitted.status === "ready" ? <ClusterReport fit={fitted.fit} /> : null}
    </section>
  );
}

function ClusterReport({ fit }: { fit: ClusterFit }) {
  return (
    <div className="grid gap-4">
      <article className="border border-border bg-card px-4 py-4" data-testid="cluster-model">
        <h3 className="font-heading text-xl">Fitted model</h3>
        <p className="mt-2 text-sm leading-6">
          {fit.model}, k = {fit.k}, n_init = {fit.parameters.n_init}, random_state = {fit.parameters.random_state}.{" "}
          {fit.scaler} is fit on the {fit.n} pairs before clustering. Silhouette on the scaled features is{" "}
          {fit.silhouette}. k was the maximum silhouette for k from 2 to 8.
        </p>
        <p className="mt-2 text-sm leading-6">{fit.exclusionNote}</p>
        <p className="mt-2 text-sm leading-6">
          Features: {fit.features.join(", ")}. Cost is CPU only, £0 per decision, the same as the rules engine. No
          language model is called.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{fit.labelRule}</p>
      </article>
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">k</th>
              {fit.silhouetteByK.map((row) => (
                <th key={row.k} className="px-3 py-2 font-medium">
                  {row.k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <th className="px-3 py-2 text-left font-medium">Silhouette</th>
              {fit.silhouetteByK.map((row) => (
                <td key={row.k} className="px-3 py-2">
                  {row.silhouette}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-6">
        Agglomerative clustering (Ward, k = {fit.agglomerative.k}) has silhouette {fit.agglomerative.silhouette}.
        HDBSCAN (min cluster size {fit.hdbscan.minClusterSize}, min samples {fit.hdbscan.minSamples}) found{" "}
        {fit.hdbscan.clusters} clusters and {fit.hdbscan.noise} noise points.
        {fit.hdbscan.silhouette != null ? ` Silhouette on the non-noise points is ${fit.hdbscan.silhouette}.` : ""}{" "}
        {fit.hdbscan.silhouetteNote}
      </p>
      <h3 className="font-heading text-xl">Cluster profiles</h3>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Each number is the inverse-scaled centre for that feature: the share of the cluster whose stored status is
        Match or Different. Names are descriptive labels of that centre, not a judgement of the rules.
      </p>
      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[48rem] text-left text-sm" data-testid="cluster-profiles">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Cluster</th>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Name match</th>
              <th className="px-3 py-2 font-medium">Date match</th>
              <th className="px-3 py-2 font-medium">Country match</th>
              <th className="px-3 py-2 font-medium">Name differs</th>
              <th className="px-3 py-2 font-medium">Date differs</th>
              <th className="px-3 py-2 font-medium">Country differs</th>
            </tr>
          </thead>
          <tbody>
            {fit.clusters.map((cluster) => (
              <tr key={cluster.id} className="border-t border-border">
                <td className="px-3 py-2">{cluster.id}</td>
                <td className="px-3 py-2">{cluster.label}</td>
                <td className="px-3 py-2">{cluster.size}</td>
                <td className="px-3 py-2">{cluster.mean.nameMatch}</td>
                <td className="px-3 py-2">{cluster.mean.dobMatch}</td>
                <td className="px-3 py-2">{cluster.mean.countryMatch}</td>
                <td className="px-3 py-2">{cluster.mean.nameDifferent}</td>
                <td className="px-3 py-2">{cluster.mean.dobDifferent}</td>
                <td className="px-3 py-2">{cluster.mean.countryDifferent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="font-heading text-xl">Projection</h3>
      <p className="text-sm leading-6 text-muted-foreground">
        Two principal components of the scaled features, coloured by the k-means cluster. This is a view of the fit,
        not a map of customers.
      </p>
      <ClusterScatter fit={fit} />
      <h3 className="font-heading text-xl">Cluster against the rules</h3>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        The rules outcome was not used in fitting. This table only counts how the recorded decision falls inside each
        cluster. It is not accuracy.
      </p>
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-left text-sm" data-testid="cluster-crosstab">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Cluster</th>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">Cleared</th>
              <th className="px-3 py-2 font-medium">Confirmed</th>
              <th className="px-3 py-2 font-medium">Review</th>
            </tr>
          </thead>
          <tbody>
            {fit.crosstab.map((row) => (
              <tr key={row.cluster} className="border-t border-border">
                <td className="px-3 py-2">{row.cluster}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">{row.cleared}</td>
                <td className="px-3 py-2">{row.confirmed}</td>
                <td className="px-3 py-2">{row.review}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClusterScatter({ fit }: { fit: ClusterFit }) {
  const width = 640;
  const height = 360;
  const pad = 16;
  const xs = fit.pca.map((point) => point.x);
  const ys = fit.pca.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (value: number) => pad + ((value - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const sy = (value: number) => height - pad - ((value - minY) / (maxY - minY || 1)) * (height - pad * 2);
  return (
    <figure className="border border-border bg-card px-4 py-4" data-testid="cluster-scatter">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="PCA scatter by cluster">
        {fit.pca.map((point) => (
          <circle
            key={point.hitId}
            cx={sx(point.x)}
            cy={sy(point.y)}
            r={3.2}
            fill={CLUSTER_COLOURS[point.cluster % CLUSTER_COLOURS.length]}
          >
            <title>
              {point.hitId} cluster {point.cluster}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs">
        {fit.clusters.map((cluster) => (
          <span key={cluster.id} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2"
              style={{ background: CLUSTER_COLOURS[cluster.id % CLUSTER_COLOURS.length] }}
            />
            {cluster.id} {cluster.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Risk({ run }: { run: MeasuredRun }) {
  const total = run.decisions.different + run.decisions.same + run.decisions.review || 1;
  return (
    <section data-testid="cost-risk" className="grid gap-4">
      <h3 className="font-heading text-xl">What the numbers mean</h3>
      <dl className="grid gap-3 border border-border bg-card px-4 py-2">
        <Definition term="Baseline" text="The rules in system/resolve.py. They do not call a model. The judging baseline, if labels existed, would be the cost of sending every labelled hit to review." />
        <Definition term="Fitness" text="100 times the share of that review-everything cost the run saves. Unavailable: this repository has no practice or held-out label file." />
        <Definition term="Unsafe clearance" text="A true same-entity or true review hit predicted different-entity. Each one costs 60 in the matrix. The count is unavailable without labels." />
        <Definition term="Overfitting" text="Development fitness minus held-out fitness. Not measured. One label file is not split in two, and this run has none." />
        <Definition term="Accuracy" text="Labelled hits whose decision matches the label. Unavailable. Workload counts below are not accuracy." />
      </dl>
      <h3 className="font-heading text-xl">This recorded run</h3>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {run.hits} hits in output/dev.jsonl. These counts are workload, not a judging score. The resolver was not timed,
        so there is no seconds-per-hit figure.
      </p>
      <div className="flex h-3 overflow-hidden border border-border" aria-hidden="true">
        <span className="bg-clear" style={{ width: `${(run.decisions.different / total) * 100}%` }} />
        <span className="bg-confirm" style={{ width: `${(run.decisions.same / total) * 100}%` }} />
        <span className="bg-review" style={{ width: `${(run.decisions.review / total) * 100}%` }} />
      </div>
      <dl className="grid gap-3 sm:grid-cols-3" data-testid="workload-counts">
        <Stat value={String(run.decisions.different)} label="Cleared" note="DIFFERENT_ENTITY" />
        <Stat value={String(run.decisions.same)} label="Confirmed" note="SAME_ENTITY" />
        <Stat value={String(run.decisions.review)} label="Review" note="a person opens these" />
      </dl>
      <h3 className="font-heading text-xl">Reason codes on this run</h3>
      <ul className="grid gap-1 text-sm">
        {run.reasonCodes.map((item) => (
          <li key={item.code} className="flex flex-wrap justify-between gap-2 border-b border-border py-1">
            <span>
              <span className="font-mono text-xs">{item.code}</span> {reasonLabel(item.code)}
            </span>
            <span>{item.count}</span>
          </li>
        ))}
      </ul>
      <h3 className="font-heading text-xl">Cost matrix</h3>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        From validate.py, and the same matrix the desk uses when a run has labels. The first column is the true label.
        A labelled hit with no prediction is scored as review. This run has no labels, so the matrix is not applied to
        a total.
      </p>
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">True label</th>
              <th className="px-3 py-2 font-medium">Predicted clear</th>
              <th className="px-3 py-2 font-medium">Predicted confirm</th>
              <th className="px-3 py-2 font-medium">Predicted review</th>
            </tr>
          </thead>
          <tbody>
            {(["DIFFERENT_ENTITY", "SAME_ENTITY", "REVIEW"] as const).map((truth) => (
              <tr key={truth} className="border-t border-border">
                <th className="px-3 py-2 text-left font-mono text-xs">{truth}</th>
                <td className="px-3 py-2">{DECISION_COST[truth].DIFFERENT_ENTITY}</td>
                <td className="px-3 py-2">{DECISION_COST[truth].SAME_ENTITY}</td>
                <td className="px-3 py-2">{DECISION_COST[truth].REVIEW}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function useMeasuredRun(): { status: "loading" | "error" } | { status: "ready"; run: MeasuredRun } {
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

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <Input
        type="number"
        className="h-10"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="border border-border bg-card px-3 py-3">
      <p className="font-heading text-2xl">{value}</p>
      <p className="text-sm">{label}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Definition({ term, text }: { term: string; text: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm font-medium">{term}</dt>
      <dd className="text-sm leading-6 text-muted-foreground">{text}</dd>
    </div>
  );
}

function BarChart({
  title,
  note,
  rows,
  format,
}: {
  title: string;
  note?: string;
  rows: { label: string; value: number; max: number }[];
  format: (value: number) => string;
}) {
  return (
    <figure className="border border-border bg-card px-4 py-4">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {note ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p> : null}
      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
            <span>{row.label}</span>
            <span className="h-2 bg-muted">
              <span className="block h-2 bg-primary" style={{ width: `${Math.max(2, (row.value / row.max) * 100)}%` }} />
            </span>
            <span>{format(row.value)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function gbp(value: number, digits = 2): string {
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function usd(value: number): string {
  return `$${value.toLocaleString("en-GB", { minimumFractionDigits: value < 1 ? 2 : 2, maximumFractionDigits: 2 })}`;
}

function latency(seconds: number, model: ModelPrice): string {
  const kind = model.publishedOutputTokensPerSec ? "published speed" : "assumption";
  return `${seconds.toFixed(1)} s ${kind}`;
}

function twoHundred(seconds: number): string {
  const minutes = (seconds * 200) / 60;
  const limit = minutes <= 30 ? "inside 30 min on this arithmetic" : "over 30 min on this arithmetic";
  return `${minutes.toFixed(1)} min · ${limit}`;
}

function privacy(model: ModelPrice): string {
  if (model.hosting === "groq") {
    return "Open weights. This price is Groq's hosted API, not a self-hosted GPU. Hit text would be sent to Groq.";
  }
  if (model.hosting === "deepseek-api") {
    return "Hosted API price, not a GPU quote. Hit text would be sent to DeepSeek.";
  }
  return `Hit text would be sent to ${model.provider}.`;
}
