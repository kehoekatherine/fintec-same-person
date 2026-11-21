import type { CaseComparisonModel, CompareStatus } from "@/lib/comparison";
import { cn } from "cn";

const DECISION_TEXT = {
  DIFFERENT_ENTITY: "text-clear",
  SAME_ENTITY: "text-confirm",
  REVIEW: "text-review",
} as const;

const STATUS_TEXT: Record<CompareStatus, string> = {
  Match: "text-confirm",
  Different: "text-clear",
  Undefined: "text-foreground",
};

export function CaseComparison({ model }: { model: CaseComparisonModel }) {
  return (
    <div data-testid="case-comparison" className="grid gap-6">
      <section aria-label="Comparison" className="grid gap-2">
        <h3 className="font-heading text-xl text-foreground">Comparison</h3>
        <div className="grid gap-2 md:hidden">
          {model.rows.map((row) => (
            <div key={row.id} className="border border-border bg-card px-3 py-2.5" data-testid={`compare-${row.id}-compact`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-muted-foreground">{row.label}</p>
                <p className={cn("font-medium", STATUS_TEXT[row.status])} data-status={row.status}>
                  {row.status}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="text-foreground">{row.customer}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hit</p>
                  <p className="text-foreground">{row.hit}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto border border-border bg-card md:block">
          <table data-testid="comparison-table" className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground" scope="col">
                  <span className="sr-only">Fact</span>
                </th>
                <th className="px-3 py-2 font-medium text-foreground" scope="col">
                  Customer
                </th>
                <th className="px-3 py-2 font-medium text-foreground" scope="col">
                  Hit
                </th>
                <th className="px-3 py-2 font-medium text-foreground" scope="col">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0" data-testid={`compare-${row.id}`}>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground" scope="row">
                    {row.label}
                  </th>
                  <td className="px-3 py-2.5 text-foreground">{row.customer}</td>
                  <td className="px-3 py-2.5 text-foreground">{row.hit}</td>
                  <td className={cn("px-3 py-2.5 font-medium", STATUS_TEXT[row.status])} data-status={row.status}>
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Conclusion" className="grid gap-1" data-testid="conclusion">
        <h3 className="font-heading text-xl text-foreground">Conclusion</h3>
        <p className={cn("font-heading text-3xl", DECISION_TEXT[model.decision])}>{model.decisionLabel}</p>
        <p className="text-base text-foreground">{model.reason}</p>
        {model.also.map((line) => (
          <p key={line} className="text-sm text-foreground">
            {line}
          </p>
        ))}
      </section>

      <section aria-label="Action" className="grid gap-1" data-testid="action">
        <h3 className="font-heading text-xl text-foreground">Action</h3>
        <p className="text-base text-foreground">{model.action}</p>
      </section>

      <section aria-label="Data sources" className="grid gap-2" data-testid="data-sources">
        <h3 className="font-heading text-xl text-foreground">Data sources</h3>
        {model.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence ids were recorded.</p>
        ) : (
          <ul className="grid gap-1.5">
            {model.sources.map((source) => (
              <li key={source.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-foreground">
                <span className="font-mono text-xs">{source.id}</span>
                <span>{source.type}</span>
                {source.missing ? <span>not in customers.jsonl</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
