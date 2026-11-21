"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
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
          accept=".csv,.json,.jsonl,text/csv,application/json"
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
          Expected CSV columns: hit_id, alert_id, name, entity_type, dob, country, city, aliases. JSON may be an
          array of hits, JSONL, or an object with hits. A hits-only file is scored against the development
          customers.jsonl. Customer ids are not invented.
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
