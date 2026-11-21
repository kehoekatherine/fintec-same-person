"use client";

import { useMemo, useState } from "react";

import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterResults } from "@/lib/filter-results";
import { DECISION_LABEL, FILTERS } from "@/lib/labels";
import type { FilterId, ResultRow } from "@/lib/types";
import { cn } from "cn";

const PAGE_SIZE = 25;

export function ResultsTable({
  rows,
  query,
  filter,
  activeHitId,
  onQuery,
  onFilter,
  onOpen,
  onReset,
  caption,
}: {
  rows: ResultRow[];
  query: string;
  filter: FilterId;
  activeHitId: string | null;
  onQuery: (query: string) => void;
  onFilter: (filter: FilterId) => void;
  onOpen: (row: ResultRow) => void;
  onReset: () => void;
  caption: string;
}) {
  const { counts, filtered } = useMemo(() => filterResults(rows, query, filter), [filter, query, rows]);
  const keyed = useMemo(
    () => filtered.map((row, index) => ({ row, key: `${row.hitId}:${index}` })),
    [filtered],
  );
  const scope = `${filter}\u0000${query}\u0000${rows.length}\u0000${rows[0]?.hitId ?? ""}\u0000${rows.at(-1)?.hitId ?? ""}`;
  const [page, setPage] = useState(1);
  const [pageScope, setPageScope] = useState(scope);
  if (pageScope !== scope) {
    setPageScope(scope);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(keyed.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = keyed.slice(start, start + PAGE_SIZE);
  const showName = rows.some((row) => row.name || row.listedName);

  return (
    <section className="grid gap-4" aria-label={caption} data-testid="results-table">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by decision">
        {FILTERS.map((item) => {
          const pressed = filter === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              variant={pressed ? "default" : "outline"}
              aria-pressed={pressed}
              data-testid={`filter-${item.id}`}
              className="h-10 px-3"
              onClick={() => onFilter(item.id)}
            >
              {item.label}
              <span className={cn("tabular-nums", pressed ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {counts[item.id]}
              </span>
            </Button>
          );
        })}
      </div>
      <label className="grid max-w-md gap-1 text-sm">
        <span className="text-muted-foreground">Search</span>
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Hit id, name, reason code, or reason"
          aria-label="Search the results"
          data-testid="result-search"
          className="h-10 bg-card"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p aria-live="polite" data-testid="result-count">
          {keyed.length === 1 ? "1 hit in view" : `${keyed.length} hits in view`}
        </p>
        {keyed.length > 0 ? (
          <p data-testid="page-status">
            {start + 1}–{start + visible.length} of {keyed.length}
          </p>
        ) : null}
      </div>
      {keyed.length === 0 ? (
        <EmptyResults query={query} onReset={onReset} />
      ) : (
        <div className="border border-border bg-card">
          <Table className="min-w-[46rem]">
            <TableCaption>{caption}</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Decision</TableHead>
                {showName ? <TableHead>Customer name</TableHead> : null}
                <TableHead>Hit</TableHead>
                <TableHead>Alert</TableHead>
                <TableHead>Reason code</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const active = item.row.hitId === activeHitId;
                return (
                  <TableRow
                    key={item.key}
                    data-testid={`result-${item.row.hitId}`}
                    data-selected={active ? "true" : "false"}
                    aria-selected={active}
                    aria-haspopup="dialog"
                    tabIndex={0}
                    className={cn("cursor-pointer hover:bg-muted/80", active && "bg-muted")}
                    onClick={() => onOpen(item.row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(item.row);
                      }
                    }}
                  >
                    <TableCell>
                      <Badge className={cn("h-6 px-2", DECISION_BADGE[item.row.decision])}>
                        {DECISION_LABEL[item.row.decision]}
                      </Badge>
                    </TableCell>
                    {showName ? (
                      <TableCell className="max-w-48">
                        <span className="block">
                          {item.row.name ??
                            (item.row.customerRecordId === "AMBIGUOUS" ? "Ambiguous customer" : "Not given")}
                        </span>
                        {item.row.listedName ? (
                          <span className="mt-1 block text-xs text-muted-foreground">{item.row.listedName}</span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-mono text-xs">{item.row.hitId}</TableCell>
                    <TableCell className="font-mono text-xs">{item.row.alertId || "Not given"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.row.reasonCode || "Not given"}</TableCell>
                    <TableCell className="font-mono text-xs">{customerCell(item.row)}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      <span className="line-clamp-2">{item.row.reason || "No reason recorded."}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3"
            data-testid="page-prev"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3"
            data-testid="page-next"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
          <p className="text-sm text-muted-foreground">
            Page {safePage} of {pageCount}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function customerCell(row: ResultRow): string {
  if (!row.customerRecordId) return "Not resolved";
  if (row.customerRecordId === "AMBIGUOUS") return "AMBIGUOUS";
  if (row.customerInFile === false || row.customerMissing) return `${row.customerRecordId} is not in customers.jsonl`;
  return row.customerRecordId;
}

function EmptyResults({ query, onReset }: { query: string; onReset: () => void }) {
  const detail = query.trim()
    ? `Nothing matches “${query.trim()}” under this filter.`
    : "No hits fall under this filter.";
  return (
    <div data-testid="empty" className="border border-border bg-card px-4 py-6">
      <h2 className="font-heading text-xl">No hits in this view</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      <Button type="button" variant="outline" className="mt-4 h-10 px-3" onClick={onReset}>
        Show every hit
      </Button>
    </div>
  );
}
