"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CasePanel } from "@/components/case-window";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { QueueSwitch } from "@/components/queue-switch";
import { ResultsTable } from "@/components/results-table";
import { UploadControl } from "@/components/upload-control";
import { explainRow } from "@/lib/explanation";
import type { DeskFailure, FilterId, QueueId, ResultPayload } from "@/lib/types";
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
    else setQueue("dev");
  }
  const [dev, setDev] = useState<ResultPayload | null>(null);
  const [devStatus, setDevStatus] = useState<"loading" | "ready" | "error">("loading");
  const [devError, setDevError] = useState<DeskFailure | null>(null);
  const [devQuery, setDevQuery] = useState("");
  const [devFilter, setDevFilter] = useState<FilterId>("all");
  const [upload, setUpload] = useState<ResultPayload | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<DeskFailure | null>(null);
  const [uploadQuery, setUploadQuery] = useState("");
  const [uploadFilter, setUploadFilter] = useState<FilterId>("all");
  const hitParam = searchParams.get("hit");
  const explanation = useMemo(() => {
    if (!hitParam) return null;
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
  }, [dev, hitParam, queue, upload]);

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
    if (queue === "upload" && upload && !upload.rows.some((row) => row.hitId === hitParam)) {
      applyParams({ hit: null });
    }
  }, [applyParams, dev, devStatus, hitParam, queue, upload]);

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

  const notice = queue === "dev" && devStatus === "ready" ? dev?.notice : queue === "upload" ? upload?.notice : null;
  const caseDetail = explanation ? (
    <CasePanel item={explanation} onBack={closeCase} />
  ) : hitParam ? (
    <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="case-loading">
      Reading this record…
    </p>
  ) : null;

  return (
    <DeskFrame notice={notice}>
      <div className="mb-3 flex flex-col gap-2">
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
          detail={queue === "dev" ? caseDetail : null}
          onQuery={setDevQuery}
          onFilter={setDevFilter}
          onOpen={(row) => applyParams({ hit: hitParam === row.hitId ? null : row.hitId })}
          onReset={() => {
            setDevQuery("");
            setDevFilter("all");
          }}
          onRetry={() => void loadDev()}
        />
      ) : null}

      {queue === "upload" && upload ? (
        <ResultsTable
          rows={upload.rows}
          query={uploadQuery}
          filter={uploadFilter}
          activeHitId={queue === "upload" ? hitParam : null}
          detail={queue === "upload" ? caseDetail : null}
          onQuery={setUploadQuery}
          onFilter={setUploadFilter}
          onOpen={(row) => applyParams({ hit: hitParam === row.hitId ? null : row.hitId })}
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
  detail,
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
  detail: ReactNode;
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
      detail={detail}
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
