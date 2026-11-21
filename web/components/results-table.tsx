"use client";

import { useMemo, useState } from "react";

import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sentences } from "@/lib/format";
import { filterResults } from "@/lib/filter-results";
import { DECISION_LABEL, FILTERS, reasonLabel } from "@/lib/labels";
import type { FilterId, ResultRow } from "@/lib/types";
import { cn } from "cn";

const PAGE_SIZE = 25;

export function ResultsTable({
  rows,
  query,
  filter,
  onQuery,
  onFilter,
  onReset,
  caption,
  detailNote,
}: {
  rows: ResultRow[];
  query: string;
  filter: FilterId;
  onQuery: (query: string) => void;
  onFilter: (filter: FilterId) => void;
  onReset: () => void;
  caption: string;
  detailNote: string;
}) {
  const { counts, filtered } = useMemo(() => filterResults(rows, query, filter), [filter, query, rows]);
  const keyed = useMemo(
    () => filtered.map((row, index) => ({ row, key: `${row.hitId}:${index}` })),
    [filtered],
  );
  const scope = `${filter}\u0000${query}\u0000${rows.length}\u0000${rows[0]?.hitId ?? ""}\u0000${rows.at(-1)?.hitId ?? ""}`;
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pageScope, setPageScope] = useState(scope);
  if (pageScope !== scope) {
    setPageScope(scope);
    setPage(1);
    setSelectedKey(null);
  }

  const pageCount = Math.max(1, Math.ceil(keyed.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = keyed.slice(start, start + PAGE_SIZE);
  const selected = keyed.find((item) => item.key === selectedKey)?.row ?? null;
  const showName = rows.some((row) => row.name);

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
          placeholder="Hit id, reason code, or reason"
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
                {showName ? <TableHead>Name</TableHead> : null}
                <TableHead>Hit</TableHead>
                <TableHead>Alert</TableHead>
                <TableHead>Reason code</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const active = item.key === selectedKey;
                return (
                  <TableRow
                    key={item.key}
                    data-testid={`result-${item.row.hitId}`}
                    data-selected={active ? "true" : "false"}
                    aria-selected={active}
                    tabIndex={0}
                    className={cn("cursor-pointer hover:bg-muted/80", active && "bg-muted")}
                    onClick={() => setSelectedKey(item.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedKey(item.key);
                      }
                    }}
                  >
                    <TableCell>
                      <Badge className={cn("h-6 px-2", DECISION_BADGE[item.row.decision])}>
                        {DECISION_LABEL[item.row.decision]}
                      </Badge>
                    </TableCell>
                    {showName ? <TableCell className="max-w-40">{item.row.name ?? "Not given"}</TableCell> : null}
                    <TableCell className="font-mono text-xs">{item.row.hitId}</TableCell>
                    <TableCell className="font-mono text-xs">{item.row.alertId || "Not given"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.row.reasonCode || "Not given"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.row.customerRecordId ?? "Not resolved"}
                    </TableCell>
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
      {selected ? <ResultDetail row={selected} note={detailNote} /> : null}
    </section>
  );
}

function ResultDetail({ row, note }: { row: ResultRow; note: string }) {
  const lines = sentences(row.reason || "No reason was recorded.");
  return (
    <article data-testid="result-detail" className="border-y border-r border-l-4 border-border border-l-primary bg-card px-5 py-5">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Selected row</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-2xl">{row.name || row.hitId}</h2>
        <Badge className={cn("h-6 px-2", DECISION_BADGE[row.decision])}>{DECISION_LABEL[row.decision]}</Badge>
        {row.reasonCode ? (
          <span className="font-mono text-xs text-muted-foreground">{row.reasonCode}</span>
        ) : null}
      </div>
      {row.reasonCode ? <p className="mt-1 text-sm text-muted-foreground">{reasonLabel(row.reasonCode)}</p> : null}
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {row.hitId}
        {row.alertId ? ` · ${row.alertId}` : ""} · Customer {row.customerRecordId ?? "not resolved"}
      </p>
      <div className="mt-4 grid gap-3">
        {lines.map((line) => (
          <p key={line} className="text-base leading-7 text-foreground">
            {line}
          </p>
        ))}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-foreground">Evidence</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{note}</p>
        {row.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence ids were recorded.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {row.evidence.map((id) => (
              <li key={id} className="font-mono text-xs text-foreground">
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
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
