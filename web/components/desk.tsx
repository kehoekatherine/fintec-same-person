"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CasePanel } from "@/components/case-window";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { QueueSwitch } from "@/components/queue-switch";
import { ResultsTable } from "@/components/results-table";
import { RunMetricsLine } from "@/components/run-metrics";
import { UploadControl } from "@/components/upload-control";
import { DeskError } from "@/lib/errors";
import { explainRow } from "@/lib/explanation";
import { developmentUrl, staticDesk } from "@/lib/public-base";
import { readRecordedUpload } from "@/lib/recorded-results";
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
  const [devStatus, setDevStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
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
          "These are the evidence ids the resolver wrote. The customer, account, notes, checks, and hit are read from this dataset's folder.",
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

  const applyDevelopment = useCallback((result: DevelopmentRead) => {
    if (result.status === "empty") {
      setDev(null);
      setDevStatus("empty");
      setDevError(null);
      return;
    }
    if (result.status === "error") {
      setDev(null);
      setDevStatus("error");
      setDevError(result.error);
      return;
    }
    setDev(result.payload);
    setDevStatus("ready");
    setDevError(null);
  }, []);

  const loadDev = useCallback(async () => {
    setDevStatus("loading");
    setDevError(null);
    applyDevelopment(await readDevelopment());
  }, [applyDevelopment]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await readDevelopment();
      if (!cancelled) applyDevelopment(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDevelopment]);

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
        const payload = staticDesk() ? await readRecordedUpload(file) : await postUpload(file);
        setUpload(payload);
        setUploadQuery("");
        setUploadFilter("all");
        setQueue("upload");
        applyParams({ queue: "upload", hit: null });
      } catch (error) {
        setUploadError({
          error: error instanceof Error ? error.message : "The desk could not read that file.",
          detail: error instanceof DeskError ? error.detail : undefined,
        });
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
        <>
          <RunMetricsLine rows={upload.rows} labels={upload.labels} heldOutLabels={upload.heldOutLabels} />
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
        </>
      ) : null}
    </DeskFrame>
  );
}

type DevelopmentRead =
  | { status: "empty" }
  | { status: "error"; error: DeskFailure }
  | { status: "ready"; payload: ResultPayload };

async function readDevelopment(): Promise<DevelopmentRead> {
  try {
    const response = await fetch(developmentUrl(), { cache: "no-store" });
    const body = (await response.json()) as ResultPayload & DeskFailure;
    if (response.status === 404) return { status: "empty" };
    if (!response.ok || !body.rows) {
      return {
        status: "error",
        error: {
          error: body.error || "The development run could not be read.",
          detail: body.detail,
        },
      };
    }
    return { status: "ready", payload: body };
  } catch {
    return { status: "error", error: { error: "The desk could not read the development run." } };
  }
}

async function postUpload(file: File): Promise<ResultPayload> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/upload", { method: "POST", body });
  const payload = (await response.json()) as ResultPayload & DeskFailure;
  if (!response.ok || !payload.rows) {
    throw new DeskError(payload.error || "The file could not be added.", { detail: payload.detail, status: response.status });
  }
  return payload;
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
  status: "loading" | "ready" | "empty" | "error";
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
  if (status === "empty") {
    return (
      <div data-testid="empty" className="border border-border bg-card px-4 py-6">
        <h2 className="font-heading text-xl">Add a dataset</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {staticDesk()
            ? "The recorded development run did not load. Reload the page, or add a file that already has a decision on every row."
            : "No dataset is loaded. Add a zip of the screening files, or one JSON bundle that contains them. The desk does not include a built-in dataset."}
        </p>
      </div>
    );
  }
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
        <h2 className="font-heading text-xl">This dataset has no hits</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">The folder did not contain a screening hit.</p>
      </div>
    );
  }
  return (
    <>
      <RunMetricsLine rows={payload.rows} labels={payload.labels} heldOutLabels={payload.heldOutLabels} />
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
        caption={payload.datasetName ?? "Dataset found on this machine"}
      />
    </>
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
