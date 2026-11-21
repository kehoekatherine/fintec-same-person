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
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Development screening
            </p>
            <h1 className="mt-2 font-heading text-3xl tracking-tight text-foreground">Screening desk</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              The development queue reads the development data folder when it is on this machine. The fictional
              brief is four example cases and stays separate. This is not a live watchlist and not a regulatory filing.
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
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
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
