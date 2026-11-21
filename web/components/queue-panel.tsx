import { ClosenessLine } from "@/components/case-assessment";
import { DECISION_BADGE } from "@/components/decision-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DECISION_LABEL, FILTERS } from "@/lib/labels";
import type { DeskCase, FilterId } from "@/lib/types";
import { cn } from "cn";

export function QueuePanel({
  cases,
  counts,
  filter,
  query,
  activeId,
  hidden,
  onFilter,
  onQuery,
  onOpen,
  onReset,
}: {
  cases: DeskCase[];
  counts: Record<FilterId, number>;
  filter: FilterId;
  query: string;
  activeId: string | null;
  hidden: boolean;
  onFilter: (filter: FilterId) => void;
  onQuery: (query: string) => void;
  onOpen: (hitId: string) => void;
  onReset: () => void;
}) {
  return (
    <section className={cn("min-w-0", hidden && "hidden lg:block")} aria-label="Hit queue">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter the queue">
        {FILTERS.map((item) => {
          const pressed = filter === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              size="lg"
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
      <label className="mb-3 grid gap-1 text-sm">
        <span className="text-muted-foreground">Search</span>
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Name, hit, or customer"
          aria-label="Search the queue"
          className="h-10 bg-card"
        />
      </label>
      <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
        {cases.length === 1 ? "1 hit in view" : `${cases.length} hits in view`}
      </p>
      {cases.length === 0 ? (
        <EmptyQueue query={query} onReset={onReset} />
      ) : (
        <ScrollArea className="h-auto max-h-[70dvh] lg:max-h-[calc(100dvh-16rem)]">
          <ul className="grid gap-2 pr-1">
            {cases.map((item) => {
              const active = item.hitId === activeId;
              const decision = item.resolution.decision;
              return (
                <li key={item.hitId}>
                  <Button
                    type="button"
                    variant={active ? "secondary" : "outline"}
                    aria-pressed={active}
                    data-selected={active ? "true" : "false"}
                    data-testid={`hit-${item.hitId}`}
                    className={cn(
                      "h-auto min-h-16 w-full items-start justify-start gap-3 border-border px-3 py-3 text-left whitespace-normal",
                      active
                        ? "border-primary bg-secondary shadow-[inset_3px_0_0_0_var(--primary)]"
                        : "bg-card",
                    )}
                    onClick={() => onOpen(item.hitId)}
                  >
                    <Badge className={cn("mt-0.5 h-6 px-2", DECISION_BADGE[decision])}>{DECISION_LABEL[decision]}</Badge>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-heading text-base leading-snug text-foreground">
                        {item.screened.name}
                      </span>
                      <span className="text-sm text-muted-foreground">against {item.hit.name}</span>
                      <span className="font-mono text-xs leading-5 break-all text-muted-foreground">
                        {item.resolution.reason_code}
                      </span>
                      {item.resolution.closeness ? (
                        <ClosenessLine closeness={item.resolution.closeness} testId={`closeness-${item.hitId}`} />
                      ) : null}
                      <span className="font-mono text-xs text-muted-foreground">
                        Fixture {item.resolution.customer_record_id ?? "no customer record"}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}

function EmptyQueue({ query, onReset }: { query: string; onReset: () => void }) {
  const detail = query.trim()
    ? `Nothing in the fixture matches “${query.trim()}” under this filter.`
    : "No hits in the fixture fall under this filter.";
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
