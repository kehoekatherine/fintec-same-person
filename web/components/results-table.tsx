"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { biasRiskForRow } from "@/lib/bias-risk";
import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterResults } from "@/lib/filter-results";
import { DECISION_LABEL, FILTERS } from "@/lib/labels";
import { confidenceFor } from "@/lib/list-scores";
import { nextSort, sortRows, type SortKey, type SortState } from "@/lib/list-sort";
import type { FilterId, ResultRow } from "@/lib/types";
import { cn } from "cn";

const PAGE_CHOICES = [
  { id: "25", label: "25", size: 25 },
  { id: "50", label: "50", size: 50 },
  { id: "100", label: "100", size: 100 },
  { id: "all", label: "All", size: Number.POSITIVE_INFINITY },
] as const;

type PageChoice = (typeof PAGE_CHOICES)[number]["id"];

export function ResultsTable({
  rows,
  query,
  filter,
  activeHitId,
  detail,
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
  detail?: ReactNode;
  onQuery: (query: string) => void;
  onFilter: (filter: FilterId) => void;
  onOpen: (row: ResultRow) => void;
  onReset: () => void;
  caption: string;
}) {
  const { counts, filtered } = useMemo(() => filterResults(rows, query, filter), [filter, query, rows]);
  const [sort, setSort] = useState<SortState | null>(null);
  const ordered = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const keyed = useMemo(
    () => ordered.map((row, index) => ({ row, key: `${row.hitId}:${index}` })),
    [ordered],
  );
  const [pageChoice, setPageChoice] = useState<PageChoice>("25");
  const chosen = PAGE_CHOICES.find((choice) => choice.id === pageChoice)?.size ?? 25;
  const pageSize = pageChoice === "all" ? Math.max(keyed.length, 1) : chosen;
  const scope = `${filter}\u0000${query}\u0000${sort?.key ?? ""}\u0000${sort?.dir ?? ""}\u0000${pageChoice}\u0000${rows.length}\u0000${rows[0]?.hitId ?? ""}\u0000${rows.at(-1)?.hitId ?? ""}`;
  const selectedIndex = activeHitId ? keyed.findIndex((item) => item.row.hitId === activeHitId) : -1;
  const [page, setPage] = useState(1);
  const [pageScope, setPageScope] = useState(scope);
  const [followedHit, setFollowedHit] = useState<string | null>(activeHitId);
  if (pageScope !== scope) {
    setPageScope(scope);
    setPage(selectedIndex >= 0 ? Math.floor(selectedIndex / pageSize) + 1 : 1);
  }
  if (activeHitId !== followedHit) {
    setFollowedHit(activeHitId);
    if (selectedIndex >= 0) setPage(Math.floor(selectedIndex / pageSize) + 1);
  }

  useEffect(() => {
    if (!activeHitId) return;
    const row = document.querySelector(`[data-testid="result-${CSS.escape(activeHitId)}"]`);
    const scroller = row?.closest("[data-testid='queue-scroller']");
    if (!(row instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return;
    const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - 8;
  }, [activeHitId, page]);

  const pageCount = Math.max(1, Math.ceil(keyed.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = keyed.slice(start, start + pageSize);
  const showName = rows.some((row) => row.name || row.listedName);
  const columnCount = showName ? 10 : 9;

  return (
    <section className="flex flex-col gap-3 lg:h-full lg:min-h-0" aria-label={caption} data-testid="results-table">
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
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Closeness is the match percentage from the name, date of birth, and country. Bias is the chance that
        match is unreliable. Confidence takes that bias off the closeness for a review or confirmation, and on a
        clearance it follows how direct the contradiction is. Select a heading to sort ascending, and select it
        again for descending.
      </p>
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
        <div data-testid="result-scroller" className="overflow-x-auto border border-border bg-card">
          <Table className="min-w-[72rem]">
            <TableCaption>{caption}</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead label="Decision" sortKey="decision" sort={sort} onSort={setSort} />
                <SortHead label="Closeness" sortKey="closeness" sort={sort} onSort={setSort} />
                <SortHead label="Bias" sortKey="bias" sort={sort} onSort={setSort} />
                <SortHead label="Confidence" sortKey="confidence" sort={sort} onSort={setSort} />
                {showName ? <SortHead label="Customer name" sortKey="name" sort={sort} onSort={setSort} /> : null}
                <SortHead label="Hit" sortKey="hit" sort={sort} onSort={setSort} />
                <SortHead label="Alert" sortKey="alert" sort={sort} onSort={setSort} />
                <SortHead label="Reason code" sortKey="reasonCode" sort={sort} onSort={setSort} />
                <SortHead label="Customer" sortKey="customer" sort={sort} onSort={setSort} />
                <SortHead label="Reason" sortKey="reason" sort={sort} onSort={setSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const active = item.row.hitId === activeHitId;
                const bias = biasRiskForRow(item.row);
                const confidence = confidenceFor({
                  decision: item.row.decision,
                  reasonCode: item.row.reasonCode,
                  closeness: item.row.closeness,
                  bias,
                });
                return (
                  <Fragment key={item.key}>
                  <TableRow
                    data-testid={`result-${item.row.hitId}`}
                    data-selected={active ? "true" : "false"}
                    aria-selected={active}
                    tabIndex={0}
                    className={cn(
                      "cursor-pointer hover:bg-muted/80",
                      active && "bg-secondary shadow-[inset_3px_0_0_0_var(--primary)] hover:bg-secondary",
                    )}
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
                    <ScoreCell
                      total={item.row.closeness?.total ?? null}
                      band={item.row.closeness?.band ?? null}
                      title={
                        item.row.closeness
                          ? `Name ${item.row.closeness.name}, date of birth ${item.row.closeness.dateOfBirth}, country ${item.row.closeness.country}`
                          : "Cleared hits are not given a closeness score."
                      }
                      testId={`closeness-${item.row.hitId}`}
                    />
                    <ScoreCell
                      total={bias?.total ?? null}
                      band={bias?.band ?? null}
                      title={
                        bias
                          ? bias.reasons.map((reason) => `${reason.label} ${reason.points}`).join(". ")
                          : "Cleared hits are not given a bias score."
                      }
                      testId={`bias-${item.row.hitId}`}
                    />
                    <ScoreCell
                      total={confidence.total}
                      band={confidence.band}
                      title={confidence.detail}
                      testId={`confidence-${item.row.hitId}`}
                    />
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
                  {active && detail ? (
                    <TableRow className="hover:bg-transparent" data-testid={`case-under-${item.row.hitId}`}>
                      <TableCell colSpan={columnCount} className="bg-muted/40 p-0">
                        {detail}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {keyed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Show
            <select
              data-testid="page-size"
              aria-label="Records per page"
              value={pageChoice}
              onChange={(event) => setPageChoice(event.target.value as PageChoice)}
              className="h-10 border border-border bg-card px-3 text-sm text-foreground"
            >
              {PAGE_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          {pageCount > 1 ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (next: SortState) => void;
}) {
  const active = sort?.key === sortKey;
  const direction = active ? sort.dir : null;
  const nextLabel =
    direction === "asc" ? `Sort ${label} descending` : `Sort ${label} ascending`;
  return (
    <TableHead aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left text-xs font-medium text-muted-foreground"
        data-testid={`sort-${sortKey}`}
        aria-label={nextLabel}
        onClick={() => onSort(nextSort(sort, sortKey))}
      >
        {label}
        {direction === "asc" ? (
          <ArrowUp className="size-3" aria-hidden />
        ) : direction === "desc" ? (
          <ArrowDown className="size-3" aria-hidden />
        ) : (
          <ArrowUpDown className="size-3 opacity-50" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

function ScoreCell({
  total,
  band,
  title,
  testId,
}: {
  total: number | null;
  band: string | null;
  title: string;
  testId: string;
}) {
  if (total == null) {
    return (
      <TableCell className="text-muted-foreground" data-testid={testId} title={title}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell data-testid={testId} title={title}>
      <span className="block font-medium tabular-nums">{total}</span>
      {band ? <span className="block text-xs text-muted-foreground">{band}</span> : null}
    </TableCell>
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
