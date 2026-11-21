"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CasePanel } from "@/components/case-window";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { QueuePanel } from "@/components/queue-panel";
import { QueueSwitch } from "@/components/queue-switch";
import { ResultsTable } from "@/components/results-table";
import { UploadControl } from "@/components/upload-control";
import { explainCase, explainRow } from "@/lib/explanation";
import { FILTERS } from "@/lib/labels";
import type { DeskFailure, DeskPayload, FilterId, QueueId, ResultPayload } from "@/lib/types";
import { uploadRejection } from "@/lib/upload-file";

export function Desk() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queueParam = searchParams.get("queue");
  const [queue, setQueue] = useState<QueueId>("dev");
  const [seenQueueParam, setSeenQueueParam] = useState(queueParam);
  if (seenQueueParam !== queueParam) {
    setSeenQueueParam(queueParam);
    if (queueParam === "upload") setQueue((current) => (current === "upload" ? current : "dev"));
    else if (queueParam === "examples") setQueue("examples");
    else setQueue("dev");
  }
  const [dev, setDev] = useState<ResultPayload | null>(null);
  const [devStatus, setDevStatus] = useState<"loading" | "ready" | "error">("loading");
  const [devError, setDevError] = useState<DeskFailure | null>(null);
  const [devQuery, setDevQuery] = useState("");
  const [devFilter, setDevFilter] = useState<FilterId>("all");
  const [examples, setExamples] = useState<DeskPayload | null>(null);
  const [examplesStatus, setExamplesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [examplesError, setExamplesError] = useState<DeskFailure | null>(null);
  const [examplesQuery, setExamplesQuery] = useState("");
  const [examplesFilter, setExamplesFilter] = useState<FilterId>("all");
  const [upload, setUpload] = useState<ResultPayload | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<DeskFailure | null>(null);
  const [uploadQuery, setUploadQuery] = useState("");
  const [uploadFilter, setUploadFilter] = useState<FilterId>("all");
  const hitParam = searchParams.get("hit");
  const explanation = useMemo(() => {
    if (!hitParam) return null;
    if (queue === "examples") {
      const item = examples?.cases.find((entry) => entry.hitId === hitParam);
      return item ? explainCase(item) : null;
    }
    if (queue === "upload") {
      const row = upload?.rows.find((entry) => entry.hitId === hitParam);
      if (!row || !upload) return null;
      return explainRow(
        row,
        upload.mode === "recorded"
          ? "These evidence ids were recorded in the uploaded file."
          : "These evidence ids are the records in the uploaded file that decided the hit.",
      );
    }
    const row = dev?.rows.find((entry) => entry.hitId === hitParam);
    return row
      ? explainRow(
          row,
          "These are the evidence ids the resolver wrote. The customer, account, notes, checks, and hit are read from the development folder.",
        )
      : null;
  }, [dev, examples, hitParam, queue, upload]);

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

  const closeCase = useCallback(() => {
    applyParams({ hit: null });
  }, [applyParams]);

  useEffect(() => {
    if (!hitParam) return;
    if (queue === "dev" && devStatus === "ready" && !dev?.rows.some((row) => row.hitId === hitParam)) {
      applyParams({ hit: null });
      return;
    }
    if (queue === "examples" && examplesStatus === "ready" && !examples?.cases.some((item) => item.hitId === hitParam)) {
      applyParams({ hit: null });
      return;
    }
    if (queue === "upload" && upload && !upload.rows.some((row) => row.hitId === hitParam)) {
      applyParams({ hit: null });
    }
  }, [applyParams, dev, devStatus, examples, examplesStatus, hitParam, queue, upload]);

  const loadDev = useCallback(async () => {
    setDevStatus("loading");
    setDevError(null);
    try {
      const response = await fetch("/api/development", { cache: "no-store" });
      const body = (await response.json()) as ResultPayload & DeskFailure;
      if (!response.ok || !body.rows) {
        setDev(null);
        setDevStatus("error");
        setDevError({
          error: body.error || "The development run could not be read.",
          detail: body.detail,
        });
        return;
      }
      setDev(body);
      setDevStatus("ready");
    } catch {
      setDev(null);
      setDevStatus("error");
      setDevError({ error: "The desk could not read the development run." });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/development", { cache: "no-store" });
        const body = (await response.json()) as ResultPayload & DeskFailure;
        if (cancelled) return;
        if (!response.ok || !body.rows) {
          setDev(null);
          setDevStatus("error");
          setDevError({
            error: body.error || "The development run could not be read.",
            detail: body.detail,
          });
          return;
        }
        setDev(body);
        setDevStatus("ready");
      } catch {
        if (cancelled) return;
        setDev(null);
        setDevStatus("error");
        setDevError({ error: "The desk could not read the development run." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadExamples = useCallback(async () => {
    setExamplesStatus("loading");
    setExamplesError(null);
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const body = (await response.json()) as DeskPayload & DeskFailure;
      if (!response.ok || !body.cases) {
        setExamples(null);
        setExamplesStatus("error");
        setExamplesError({
          error: body.error || "The practice examples could not be read.",
          detail: body.detail,
        });
        return;
      }
      setExamples(body);
      setExamplesStatus("ready");
    } catch {
      setExamples(null);
      setExamplesStatus("error");
      setExamplesError({ error: "The desk could not read the practice examples." });
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
          setExamples(null);
          setExamplesStatus("error");
          setExamplesError({
            error: body.error || "The practice examples could not be read.",
            detail: body.detail,
          });
          return;
        }
        setExamples(body);
        setExamplesStatus("ready");
      } catch {
        if (cancelled) return;
        setExamples(null);
        setExamplesStatus("error");
        setExamplesError({ error: "The desk could not read the practice examples." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openQueue = useCallback(
    (next: QueueId) => {
      if (next === "upload" && !upload) return;
      setQueue(next);
      applyParams({
        queue: next === "dev" ? null : next,
        hit: null,
      });
    },
    [applyParams, upload],
  );

  const sendFile = useCallback(
    async (file: File) => {
      const rejection = uploadRejection(file.name, file.size);
      if (rejection) {
        setUploadError({ error: rejection });
        return;
      }
      setUploadBusy(true);
      setUploadError(null);
      try {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = (await response.json()) as ResultPayload & DeskFailure;
        if (!response.ok || !payload.rows) {
          setUploadError({
            error: payload.error || "The file could not be added.",
            detail: payload.detail,
          });
          return;
        }
        setUpload(payload);
        setUploadQuery("");
        setUploadFilter("all");
        setQueue("upload");
        applyParams({ queue: "upload", hit: null });
      } catch {
        setUploadError({ error: "The desk could not read that file." });
      } finally {
        setUploadBusy(false);
      }
    },
    [applyParams],
  );

  const examplesView = useMemo(() => {
    const cases = examples?.cases ?? [];
    const needle = examplesQuery.trim().toLowerCase();
    const searched = needle
      ? cases.filter((item) =>
          [item.screened.name, item.hit.name, item.hitId, item.alertId, item.resolution.reason_code, item.resolution.decision]
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
    const selected = FILTERS.find((item) => item.id === examplesFilter);
    const filtered = selected?.decision
      ? searched.filter((item) => item.resolution.decision === selected.decision)
      : searched;
    return { counts, filtered };
  }, [examples, examplesFilter, examplesQuery]);

  const notice =
    queue === "dev" && devStatus === "ready"
      ? dev?.notice
      : queue === "examples" && examplesStatus === "ready"
        ? examples?.notice
        : queue === "upload"
          ? upload?.notice
          : null;

  return (
    <DeskFrame
      notice={notice}
      panelOpen={Boolean(hitParam)}
      panel={
        explanation ? (
          <CasePanel item={explanation} onBack={closeCase} />
        ) : hitParam ? (
          <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="case-loading">
            Reading this record…
          </p>
        ) : null
      }
    >
      <div className="mb-8 grid gap-6">
        <QueueSwitch queue={queue} showUpload={Boolean(upload)} onQueue={openQueue} />
        <UploadControl busy={uploadBusy} error={uploadError} onFile={(file) => void sendFile(file)} />
      </div>

      {queue === "dev" ? (
        <DevQueue
          status={devStatus}
          error={devError}
          payload={dev}
          query={devQuery}
          filter={devFilter}
          activeHitId={queue === "dev" ? hitParam : null}
          onQuery={setDevQuery}
          onFilter={setDevFilter}
          onOpen={(row) => applyParams({ hit: row.hitId })}
          onReset={() => {
            setDevQuery("");
            setDevFilter("all");
          }}
          onRetry={() => void loadDev()}
        />
      ) : null}

      {queue === "examples" ? (
        examplesStatus === "loading" ? (
          <LoadingState />
        ) : examplesStatus === "error" ? (
          <Failure
            title="The practice examples did not load"
            error={examplesError}
            action="Try again"
            onAction={() => void loadExamples()}
          />
        ) : (
          <QueuePanel
            cases={examplesView.filtered}
            counts={examplesView.counts}
            filter={examplesFilter}
            query={examplesQuery}
            activeId={hitParam}
            hidden={false}
            onFilter={setExamplesFilter}
            onQuery={setExamplesQuery}
            onOpen={(id) => applyParams({ hit: id })}
            onReset={() => {
              setExamplesQuery("");
              setExamplesFilter("all");
            }}
          />
        )
      ) : null}

      {queue === "upload" && upload ? (
        <ResultsTable
          rows={upload.rows}
          query={uploadQuery}
          filter={uploadFilter}
          activeHitId={queue === "upload" ? hitParam : null}
          onQuery={setUploadQuery}
          onFilter={setUploadFilter}
          onOpen={(row) => applyParams({ hit: row.hitId })}
          onReset={() => {
            setUploadQuery("");
            setUploadFilter("all");
          }}
          caption={`Uploaded file ${upload.filename ?? ""}`.trim()}
        />
      ) : null}
    </DeskFrame>
  );
}

function DevQueue({
  status,
  error,
  payload,
  query,
  filter,
  activeHitId,
  onQuery,
  onFilter,
  onOpen,
  onReset,
  onRetry,
}: {
  status: "loading" | "ready" | "error";
  error: DeskFailure | null;
  payload: ResultPayload | null;
  query: string;
  filter: FilterId;
  activeHitId: string | null;
  onQuery: (query: string) => void;
  onFilter: (filter: FilterId) => void;
  onOpen: (row: ResultPayload["rows"][number]) => void;
  onReset: () => void;
  onRetry: () => void;
}) {
  if (status === "loading") return <LoadingState mode="table" />;
  if (status === "error") {
    return (
      <Failure
        title="The development run did not load"
        error={error}
        action="Try again"
        onAction={onRetry}
      />
    );
  }
  if (!payload || payload.rows.length === 0) {
    return (
      <div data-testid="empty" className="border border-border bg-card px-4 py-6">
        <h2 className="font-heading text-xl">The development run has no hits</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          output/dev.jsonl did not contain a screening result.
        </p>
      </div>
    );
  }
  return (
    <ResultsTable
      rows={payload.rows}
      query={query}
      filter={filter}
      activeHitId={activeHitId}
      onQuery={onQuery}
      onFilter={onFilter}
      onOpen={onOpen}
      onReset={onReset}
      caption="Development screening results"
    />
  );
}

function Failure({
  title,
  error,
  action,
  onAction,
}: {
  title: string;
  error: DeskFailure | null;
  action: string;
  onAction: () => void;
}) {
  return (
    <div data-testid="error" className="max-w-xl">
      <Alert variant="destructive" className="bg-card px-4 py-3">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{error?.error ?? "The desk could not load this queue."}</p>
          {error?.detail ? (
            <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">{error.detail}</pre>
          ) : null}
        </AlertDescription>
      </Alert>
      <Button type="button" className="mt-4 h-10 px-4" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}
