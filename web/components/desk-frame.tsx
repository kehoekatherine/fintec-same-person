"use client";

import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function DeskFrame({
  children,
  onRerun,
  busy = false,
  notice,
}: {
  children: ReactNode;
  onRerun?: () => void;
  busy?: boolean;
  notice?: string | null;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl tracking-tight text-foreground sm:text-4xl">Watchlist Screening Desk</h1>
            <div className="mt-2 h-1 w-12 bg-primary" aria-hidden />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            {onRerun ? (
              <Button type="button" data-testid="rerun" className="h-10 shrink-0 px-4" onClick={onRerun} disabled={busy}>
                <RotateCw className={busy ? "animate-spin" : undefined} />
                {busy ? "Running resolver…" : "Re-run resolver"}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 max-w-4xl text-sm leading-5 text-muted-foreground">
          A contradiction clears a hit, agreement on the required facts confirms it, and everything else stays for
          review. The desk shows one run at a time and does not keep the customer file.
        </p>
        {notice ? (
          <p className="mt-1 max-w-4xl text-sm leading-5 text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
      </header>
      <main data-testid="queue-scroller" className="min-h-0 flex-1 overflow-auto overscroll-y-contain px-4 py-3 sm:px-6">
        {children}
      </main>
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
