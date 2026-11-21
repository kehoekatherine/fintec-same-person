import type { CompareDisplayRow, CompareStatus, OtherLine } from "@/lib/compare-rows";
import { cn } from "cn";

const STATUS_TEXT: Record<CompareStatus, string> = {
  Match: "text-confirm",
  Different: "text-clear",
  Undefined: "text-muted-foreground",
};

export function CustomerHitCompare({ rows }: { rows: CompareDisplayRow[] }) {
  return (
    <section aria-label="Customer and watchlist hit" data-testid="customer-hit-compare">
      <h3 className="font-heading text-2xl text-foreground">Customer and watchlist hit</h3>
      <div className="mt-2 overflow-hidden border border-border bg-card">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="w-[4.75rem] px-2 py-2 font-medium text-muted-foreground" scope="col">
                <span className="sr-only">Field</span>
              </th>
              <th className="px-2 py-2 font-medium text-foreground" scope="col">
                Customer
              </th>
              <th className="px-2 py-2 font-medium text-foreground" scope="col">
                Watchlist hit
              </th>
              <th className="w-[5.25rem] px-2 py-2 font-medium text-foreground" scope="col">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top last:border-b-0" data-testid={`compare-${row.id}`}>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground" scope="row">
                  {row.label}
                </th>
                <td className="px-2 py-2 break-words text-foreground" data-testid={`compare-${row.id}-customer`}>
                  {row.customer}
                </td>
                <td className="px-2 py-2 break-words text-foreground" data-testid={`compare-${row.id}-hit`}>
                  {row.hit}
                </td>
                <td
                  className={cn("px-2 py-2 font-medium", STATUS_TEXT[row.status])}
                  data-testid={`compare-${row.id}-status`}
                  data-status={row.status}
                >
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OtherMatching({ lines }: { lines: OtherLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-label="Other matching information" data-testid="other-matching" className="grid gap-2">
      <h3 className="font-heading text-2xl text-foreground">Other matching information</h3>
      <ul className="grid gap-2">
        {lines.map((line) => (
          <li key={`${line.label}:${line.id}`} data-testid={`other-${line.id}`} className="border border-border bg-card px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-xs text-foreground">{line.id}</span>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{line.label}</span>
            </p>
            <p className="mt-1 line-clamp-1 text-sm text-foreground">{line.line}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
