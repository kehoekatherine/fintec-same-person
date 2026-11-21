"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CaseView } from "@/components/case-view";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { QueuePanel } from "@/components/queue-panel";
import { QueueSwitch } from "@/components/queue-switch";
import { ResultsTable } from "@/components/results-table";
import { UploadControl } from "@/components/upload-control";
import { FILTERS } from "@/lib/labels";
import type { DeskFailure, DeskPayload, FilterId, QueueId, ResultPayload } from "@/lib/types";
import { uploadRejection } from "@/lib/upload-file";

function isFilter(value: string | null): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

export function Desk() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter: FilterId = isFilter(searchParams.get("filter")) ? (searchParams.get("filter") as FilterId) : "all";
  const hitId = searchParams.get("hit");
  const queueParam = searchParams.get("queue");
  const [queue, setQueue] = useState<QueueId>(queueParam === "brief" ? "brief" : "dev");
  const [seenQueueParam, setSeenQueueParam] = useState(queueParam);
  if (seenQueueParam !== queueParam) {
    setSeenQueueParam(queueParam);
    if (queueParam === "brief") setQueue("brief");
    else if (queueParam === "upload") setQueue((current) => (current === "upload" ? current : "dev"));
    else setQueue("dev");
  }
  const [query, setQuery] = useState("");
  const [brief, setBrief] = useState<DeskPayload | null>(null);
  const [briefStatus, setBriefStatus] = useState<"loading" | "ready" | "error">("loading");
  const [briefError, setBriefError] = useState<DeskFailure | null>(null);
  const [rerunError, setRerunError] = useState<DeskFailure | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
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

  const loadBrief = useCallback(async () => {
    setBriefStatus("loading");
    setBriefError(null);
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const body = (await response.json()) as DeskPayload & DeskFailure;
      if (!response.ok || !body.cases) {
        setBrief(null);
        setBriefStatus("error");
        setBriefError({
          error: body.error || "The queue could not be loaded.",
          detail: body.detail,
        });
        return;
      }
      setBrief(body);
      setBriefStatus("ready");
    } catch {
      setBrief(null);
      setBriefStatus("error");
      setBriefError({ error: "The desk could not reach the resolver." });
    }
  }, []);

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
        const response = await fetch("/api/cases", { cache: "no-store" });
        const body = (await response.json()) as DeskPayload & DeskFailure;
        if (cancelled) return;
        if (!response.ok || !body.cases) {
          setBrief(null);
          setBriefStatus("error");
          setBriefError({
            error: body.error || "The queue could not be loaded.",
            detail: body.detail,
          });
          return;
        }
        setBrief(body);
        setBriefStatus("ready");
      } catch {
        if (cancelled) return;
        setBrief(null);
        setBriefStatus("error");
        setBriefError({ error: "The desk could not reach the resolver." });
      }
    })();
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (queue !== "brief" || briefStatus !== "ready" || !brief || hitId) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const first = brief.cases[0];
    if (!first) return;
    applyParams({ hit: first.hitId });
  }, [applyParams, brief, briefStatus, hitId, queue]);

  const openQueue = useCallback(
    (next: QueueId) => {
      if (next === "upload" && !upload) return;
      setQueue(next);
      applyParams({
        queue: next === "dev" ? null : next,
        hit: next === "brief" ? hitId : null,
      });
    },
    [applyParams, hitId, upload],
  );

  const rerun = useCallback(async () => {
    setBriefBusy(true);
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
      setBrief(body);
      setBriefStatus("ready");
      setBriefError(null);
    } catch {
      setRerunError({ error: "The desk could not reach the resolver." });
    } finally {
      setBriefBusy(false);
    }
  }, []);

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

  const visible = useMemo(() => {
    const cases = brief?.cases ?? [];
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
  }, [brief, filter, query]);

  const openCase = brief?.cases.find((item) => item.hitId === hitId) ?? null;
  const notice =
    queue === "dev" && devStatus === "ready"
      ? dev?.notice
      : queue === "brief" && briefStatus === "ready"
        ? brief?.notice
        : queue === "upload"
          ? upload?.notice
          : null;

  return (
    <DeskFrame
      onRerun={queue === "brief" ? () => void rerun() : undefined}
      busy={briefBusy}
      notice={notice}
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
          onQuery={setDevQuery}
          onFilter={setDevFilter}
          onReset={() => {
            setDevQuery("");
            setDevFilter("all");
          }}
          onRetry={() => void loadDev()}
        />
      ) : null}

      {queue === "brief" ? (
        <BriefQueue
          status={briefStatus}
          error={briefError}
          rerunError={rerunError}
          payload={brief}
          visible={visible}
          filter={filter}
          query={query}
          openCase={openCase}
          onFilter={(next) => applyParams({ filter: next === "all" ? null : next })}
          onQuery={setQuery}
          onOpen={(id) => {
            applyParams({ hit: id });
            window.scrollTo({ top: 0 });
          }}
          onBack={() => {
            applyParams({ hit: null });
            window.scrollTo({ top: 0 });
          }}
          onReset={() => {
            setQuery("");
            applyParams({ filter: null });
          }}
          onRetry={() => void loadBrief()}
        />
      ) : null}

      {queue === "upload" && upload ? (
        <ResultsTable
          rows={upload.rows}
          query={uploadQuery}
          filter={uploadFilter}
          onQuery={setUploadQuery}
          onFilter={setUploadFilter}
          onReset={() => {
            setUploadQuery("");
            setUploadFilter("all");
          }}
          caption={`Uploaded file ${upload.filename ?? ""}`.trim()}
          detailNote={
            upload.mode === "recorded"
              ? "These evidence ids were recorded in the uploaded file."
              : "These evidence ids are the records in the uploaded file that decided the hit."
          }
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
  onQuery,
  onFilter,
  onReset,
  onRetry,
}: {
  status: "loading" | "ready" | "error";
  error: DeskFailure | null;
  payload: ResultPayload | null;
  query: string;
  filter: FilterId;
  onQuery: (query: string) => void;
  onFilter: (filter: FilterId) => void;
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
      onQuery={onQuery}
      onFilter={onFilter}
      onReset={onReset}
      caption="Development screening results"
      detailNote="The development run does not include the customer files. These are the evidence ids the resolver wrote."
    />
  );
}

function BriefQueue({
  status,
  error,
  rerunError,
  payload,
  visible,
  filter,
  query,
  openCase,
  onFilter,
  onQuery,
  onOpen,
  onBack,
  onReset,
  onRetry,
}: {
  status: "loading" | "ready" | "error";
  error: DeskFailure | null;
  rerunError: DeskFailure | null;
  payload: DeskPayload | null;
  visible: { counts: Record<FilterId, number>; filtered: DeskPayload["cases"] };
  filter: FilterId;
  query: string;
  openCase: DeskPayload["cases"][number] | null;
  onFilter: (filter: FilterId) => void;
  onQuery: (query: string) => void;
  onOpen: (hitId: string) => void;
  onBack: () => void;
  onReset: () => void;
  onRetry: () => void;
}) {
  const caseHidden = !openCase;
  const queueHidden = Boolean(openCase);
  return (
    <div className="grid gap-4">
      {rerunError ? (
        <Alert variant="destructive" className="bg-card px-4 py-3" data-testid="rerun-error">
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
        <Failure title="The queue did not load" error={error} action="Try again" onAction={onRetry} />
      ) : null}
      {status === "ready" && payload && payload.cases.length === 0 ? (
        <div data-testid="empty" className="border border-border bg-card px-4 py-6">
          <h2 className="font-heading text-xl">The resolver returned no hits</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The fictional fixture produced an empty queue. Re-run the resolver if that is unexpected.
          </p>
        </div>
      ) : null}
      {status === "ready" && payload && payload.cases.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          <QueuePanel
            cases={visible.filtered}
            counts={visible.counts}
            filter={filter}
            query={query}
            activeId={openCase?.hitId ?? null}
            hidden={queueHidden}
            onFilter={onFilter}
            onQuery={onQuery}
            onOpen={onOpen}
            onReset={onReset}
          />
          <CaseView item={openCase} hidden={caseHidden} onBack={onBack} />
        </div>
      ) : null}
    </div>
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
