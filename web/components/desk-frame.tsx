"use client";

import { RotateCw } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

export function DeskFrame({
  children,
  onRerun,
  busy = false,
  notice,
  panel,
  panelOpen = false,
}: {
  children: ReactNode;
  onRerun?: () => void;
  busy?: boolean;
  notice?: string | null;
  panel?: ReactNode;
  panelOpen?: boolean;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const savedScroll = useRef(0);

  useLayoutEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    if (node.scrollTop !== savedScroll.current) node.scrollTop = savedScroll.current;
  }, [panelOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border">
        <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl tracking-tight text-foreground sm:text-5xl">
              Watching Screening Desk
            </h1>
            <div className="mt-3 h-1 w-16 bg-primary" aria-hidden />
            <p className="mt-4 max-w-2xl text-base leading-7 text-foreground">
              Each row compares a customer with a watchlist hit. A contradiction clears the hit, agreement on the
              required facts confirms it, and everything else stays for a person to review. Closeness is how closely
              the name, date of birth, and country agree. Bias is the chance that agreement is unreliable, and
              confidence takes that bias off the closeness.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              This is the development run. It is not a live watchlist and not a regulatory filing.
            </p>
            {notice ? (
              <p className="mt-3 max-w-xl text-sm leading-6 text-foreground/85" role="status">
                {notice}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <ThemeToggle />
            {onRerun ? (
              <Button
                type="button"
                data-testid="rerun"
                className="h-10 shrink-0 px-4"
                onClick={onRerun}
                disabled={busy}
              >
                <RotateCw className={busy ? "animate-spin" : undefined} />
                {busy ? "Running resolver…" : "Re-run resolver"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)]">
        <main
          ref={mainRef}
          data-testid="queue-scroller"
          className="min-h-0 overflow-auto overscroll-y-contain px-4 py-4 sm:px-6"
          onScroll={(event) => {
            savedScroll.current = event.currentTarget.scrollTop;
          }}
        >
          {children}
        </main>
        <aside
          data-testid="case-column"
          data-open={panelOpen ? "true" : "false"}
          aria-label="Case"
          className={cn(
            "min-h-0 overflow-y-auto overscroll-y-contain bg-card lg:border-l lg:border-border",
            panelOpen
              ? "fixed inset-0 z-40 h-dvh bg-background lg:static lg:z-auto lg:h-full lg:max-h-full lg:bg-card"
              : "hidden lg:block lg:h-full",
          )}
        >
          {panel ?? <CasePlaceholder />}
        </aside>
      </div>
    </div>
  );
}

function CasePlaceholder() {
  return (
    <div data-testid="case-placeholder" className="px-5 py-6">
      <h2 className="font-heading text-2xl text-foreground">Choose a hit</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Select a row to read the decision, the reason codes, and the records.
      </p>
    </div>
  );
}

export function DeskFallback() {
  return (
    <DeskFrame>
      <LoadingState />
    </DeskFrame>
  );
}

export function LoadingState({ mode = "queue" }: { mode?: "queue" | "table" }) {
  if (mode === "table") {
    return (
      <div data-testid="loading" role="status" aria-live="polite" className="grid gap-3">
        <p className="sr-only">Loading the development run.</p>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return (
    <div data-testid="loading" role="status" aria-live="polite" className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <p className="sr-only">Loading the development run.</p>
      <div className="grid gap-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="hidden gap-3 lg:grid">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
