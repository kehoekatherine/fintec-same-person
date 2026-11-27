"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { staticDesk } from "@/lib/public-base";
import type { DeskFailure } from "@/lib/types";
import { cn } from "cn";

export function UploadControl({
  busy,
  error,
  onFile,
}: {
  busy: boolean;
  error: DeskFailure | null;
  onFile: (file: File) => void;
}) {
  return (
    <section aria-label="Add hits" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="text-sm font-medium text-foreground">Add hits</h2>
      <label
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-10 cursor-pointer px-3",
          busy && "pointer-events-none opacity-50",
        )}
      >
        {busy ? "Reading file…" : "Choose file"}
        <input
          type="file"
          accept=".csv,.json,.jsonl,.zip,text/csv,application/json,application/zip"
          className="sr-only"
          data-testid="upload-input"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
      </label>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">File format</summary>
        <p className="mt-1 max-w-3xl leading-5" data-testid="upload-hint">
          {staticDesk()
            ? "On the public site, choose a .csv, .json, or .jsonl file that already has a decision on every row. A zip of source files, and a file with no decisions, need the local desk, which runs the Python resolver."
            : "Add a .zip of a data folder, or a .json bundle of its files: customers, hits, alerts, accounts, onboarding, kyc checks, notes, search results, and name variants. Labels in that same folder are optional. A hits-only file is not joined to another customer file; the missing file is named. A file that already has a decision on every row is shown as recorded."}
        </p>
      </details>
      {error ? (
        <Alert variant="destructive" className="basis-full" data-testid="upload-error">
          <AlertTitle>The file was not added</AlertTitle>
          <AlertDescription>
            <p>{error.error}</p>
            {error.detail ? (
              <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap text-foreground">
                {error.detail}
              </pre>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
