"use client";

import { RotateCw } from "lucide-react";

import type { ReactNode } from "react";

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
    <div className="min-h-dvh">
      <header className="border-b border-border/80 bg-card/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
              Fictional examples from the brief
            </p>
            <h1 className="mt-1 font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
              Screening desk
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Four published cases. The Python resolver decides whether each watchlist hit is the
              screened customer. This is not a live watchlist.
            </p>
            {notice ? (
              <p className="mt-2 text-sm text-foreground/80" role="status">
                {notice}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            data-testid="rerun"
            className="h-11 shrink-0 px-4"
            onClick={onRerun}
            disabled={!onRerun || busy}
          >
            <RotateCw className={busy ? "animate-spin" : undefined} />
            {busy ? "Running resolver…" : "Re-run resolver"}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5">{children}</main>
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

export function LoadingState() {
  return (
    <div data-testid="loading" role="status" aria-live="polite" className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <p className="sr-only">Running the resolver on the fictional fixture.</p>
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
