"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AboutDesk } from "@/components/about-desk";
import { CaseAnalysis } from "@/components/case-analysis";
import { DeskFrame, LoadingState } from "@/components/desk-frame";
import { ModelCost } from "@/components/model-cost";
import { QueueSwitch } from "@/components/queue-switch";
import { ViewNav } from "@/components/view-nav";
import { UploadControl } from "@/components/upload-control";
import { costSection, deskView, legacyAddress, type CostSection, type DeskView } from "@/lib/desk-view";
import { DeskError } from "@/lib/errors";
import { developmentUrl, staticDesk } from "@/lib/public-base";
import { readRecordedUpload } from "@/lib/recorded-results";
import type { DeskFailure, QueueId, ResultPayload } from "@/lib/types";
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
  const [upload, setUpload] = useState<ResultPayload | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<DeskFailure | null>(null);
  const hitParam = searchParams.get("hit");
  const rawView = searchParams.get("view");
  const rawSection = searchParams.get("section");
  const view = deskView(rawView, hitParam);
  const section = costSection(rawSection);

  const applyParams = useCallback(
    (next: Record<string, string | null>, mode: "push" | "replace" = "push") => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }
      const queryString = params.toString();
      const href = queryString ? `${pathname}?${queryString}` : pathname;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeRows = useMemo(
    () => (queue === "upload" && upload ? upload.rows : (dev?.rows ?? [])),
    [dev?.rows, queue, upload],
  );

  const openView = useCallback(
    (next: DeskView) => {
      if (next === "about") {
        applyParams({ view: "about", section: null, hit: null });
        return;
      }
      if (next === "cost") {
        applyParams({ view: "cost", section: null, hit: null });
        return;
      }
      const known = hitParam && activeRows.some((row) => row.hitId === hitParam) ? hitParam : null;
      applyParams({ view: "analysis", section: null, hit: known ?? activeRows[0]?.hitId ?? null });
    },
    [activeRows, applyParams, hitParam],
  );

  const openSection = useCallback(
    (next: CostSection) => {
      applyParams({ view: "cost", section: next === "models" ? null : next, hit: null });
    },
    [applyParams],
  );

  useEffect(() => {
    const next = legacyAddress(rawView, rawSection, hitParam);
    if (!next) return;
    applyParams(next, "replace");
  }, [applyParams, hitParam, rawSection, rawView]);

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
      const rows = next === "upload" ? upload?.rows : dev?.rows;
      applyParams({
        view: "analysis",
        queue: next === "dev" ? null : next,
        hit: rows?.[0]?.hitId ?? null,
      });
    },
    [applyParams, dev?.rows, upload],
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
        setQueue("upload");
        applyParams({
          view: "analysis",
          queue: "upload",
          section: null,
          hit: payload.rows[0]?.hitId ?? null,
        });
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

  const notice = queue === "upload" && upload ? upload.notice : devStatus === "ready" ? dev?.notice : null;

  return (
    <DeskFrame notice={view === "cost" ? null : notice}>
      <div className="mb-3 flex flex-col gap-2">
        <ViewNav view={view} onView={openView} />
        {view === "analysis" ? (
          <>
            <QueueSwitch queue={queue} showUpload={Boolean(upload)} onQueue={openQueue} />
            <UploadControl busy={uploadBusy} error={uploadError} onFile={(file) => void sendFile(file)} />
          </>
        ) : null}
      </div>

      {view === "about" ? (
        <AboutDesk rows={dev?.rows ?? []} onHit={(hit) => applyParams({ view: "analysis", hit })} />
      ) : null}

      {view === "analysis" ? (
        devStatus === "loading" && queue !== "upload" ? (
          <LoadingState mode="table" />
        ) : devStatus === "error" && queue !== "upload" ? (
          <p className="text-sm" data-testid="analysis-error">
            {devError?.error ?? "The recorded run could not be read."}
          </p>
        ) : (
          <CaseAnalysis rows={activeRows} hitId={hitParam} onHit={(hit) => applyParams({ view: "analysis", hit })} />
        )
      ) : null}

      {view === "cost" ? <ModelCost section={section} onSection={openSection} /> : null}
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
