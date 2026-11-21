"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CaseView } from "@/components/case-view";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { QueuePanel } from "@/components/queue-panel";
import { FILTERS } from "@/lib/labels";
import type { DeskFailure, DeskPayload, FilterId } from "@/lib/types";

function isFilter(value: string | null): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

export function Desk() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter: FilterId = isFilter(searchParams.get("filter")) ? (searchParams.get("filter") as FilterId) : "all";
  const hitId = searchParams.get("hit");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<DeskPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<DeskFailure | null>(null);
  const [rerunError, setRerunError] = useState<DeskFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const applyParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const body = (await response.json()) as DeskPayload & DeskFailure;
      if (!response.ok || !body.cases) {
        setPayload(null);
        setStatus("error");
        setError({
          error: body.error || "The queue could not be loaded.",
          detail: body.detail,
        });
        return;
      }
      setPayload(body);
      setStatus("ready");
    } catch {
      setPayload(null);
      setStatus("error");
      setError({ error: "The desk could not reach the resolver." });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cases", { cache: "no-store" });
        const body = (await response.json()) as DeskPayload & DeskFailure;
        if (cancelled) return;
        if (!response.ok || !body.cases) {
          setStatus("error");
          setError({
            error: body.error || "The queue could not be loaded.",
            detail: body.detail,
          });
          return;
        }
        setPayload(body);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError({ error: "The desk could not reach the resolver." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !payload || hitId) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const first = payload.cases[0];
    if (!first) return;
    applyParams({ hit: first.hitId });
  }, [applyParams, hitId, payload, status]);

  const rerun = useCallback(async () => {
    setBusy(true);
    setRerunError(null);
    try {
      const response = await fetch("/api/cases", { method: "POST", cache: "no-store" });
      const body = (await response.json()) as DeskPayload & DeskFailure;
      if (!response.ok || !body.cases) {
        setRerunError({
          error: body.error || "The resolver did not finish.",
          detail: body.detail,
        });
        return;
      }
      setPayload(body);
      setStatus("ready");
      setError(null);
    } catch {
      setRerunError({ error: "The desk could not reach the resolver." });
    } finally {
      setBusy(false);
    }
  }, []);

  const visible = useMemo(() => {
    const cases = payload?.cases ?? [];
    const needle = query.trim().toLowerCase();
    const searched = needle
      ? cases.filter((item) =>
          [
            item.screened.name,
            item.hit.name,
            item.hitId,
            item.alertId,
            item.resolution.customer_record_id ?? "",
            item.resolution.reason_code,
            item.resolution.decision,
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : cases;
    const counts = {
      all: searched.length,
      clear: searched.filter((item) => item.resolution.decision === "DIFFERENT_ENTITY").length,
      confirm: searched.filter((item) => item.resolution.decision === "SAME_ENTITY").length,
      review: searched.filter((item) => item.resolution.decision === "REVIEW").length,
    };
    const selected = FILTERS.find((item) => item.id === filter);
    const filtered = selected?.decision
      ? searched.filter((item) => item.resolution.decision === selected.decision)
      : searched;
    return { counts, filtered };
  }, [filter, payload, query]);

  const openCase = payload?.cases.find((item) => item.hitId === hitId) ?? null;
  const caseHidden = !hitId;
  const queueHidden = Boolean(hitId);

  return (
    <DeskFrame
      onRerun={() => void rerun()}
      busy={busy || status === "loading"}
      notice={status === "ready" ? payload?.notice : null}
    >
      {rerunError ? (
        <Alert variant="destructive" className="mb-4 bg-card px-4 py-3" data-testid="rerun-error">
          <AlertTitle>The resolver did not finish</AlertTitle>
          <AlertDescription>
            <p>{rerunError.error}</p>
            {rerunError.detail ? (
              <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">
                {rerunError.detail}
              </pre>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "loading" ? <LoadingState /> : null}

      {status === "error" ? (
        <div data-testid="error" className="max-w-xl">
          <Alert variant="destructive" className="bg-card px-4 py-3">
            <AlertTitle>The queue did not load</AlertTitle>
            <AlertDescription>
              <p>{error?.error ?? "The resolver did not return a queue."}</p>
              {error?.detail ? (
                <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">
                  {error.detail}
                </pre>
              ) : null}
            </AlertDescription>
          </Alert>
          <Button type="button" className="mt-4 h-11 px-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {status === "ready" && payload && payload.cases.length === 0 ? (
        <div data-testid="empty" className="rounded-xl bg-card px-4 py-6 ring-1 ring-foreground/10">
          <h2 className="font-heading text-xl">The resolver returned no hits</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The fictional fixture produced an empty queue. Re-run the resolver if that is unexpected.
          </p>
        </div>
      ) : null}

      {status === "ready" && payload && payload.cases.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          <QueuePanel
            cases={visible.filtered}
            counts={visible.counts}
            filter={filter}
            query={query}
            activeId={openCase?.hitId ?? null}
            hidden={queueHidden}
            onFilter={(next) => applyParams({ filter: next === "all" ? null : next })}
            onQuery={setQuery}
            onOpen={(id) => {
              applyParams({ hit: id });
              window.scrollTo({ top: 0 });
            }}
            onReset={() => {
              setQuery("");
              applyParams({ filter: null });
            }}
          />
          <CaseView
            item={openCase}
            hidden={caseHidden}
            onBack={() => {
              applyParams({ hit: null });
              window.scrollTo({ top: 0 });
            }}
          />
        </div>
      ) : null}
    </DeskFrame>
  );
}
