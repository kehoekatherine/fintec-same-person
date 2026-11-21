"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeskFailure, OpenedRecord, SourcedRecord } from "@/lib/types";

export function DevRecord({
  hitId,
  alertId,
  customerRecordId,
}: {
  hitId: string;
  alertId: string;
  customerRecordId: string | null;
}) {
  const [record, setRecord] = useState<OpenedRecord | null>(null);
  const [error, setError] = useState<DeskFailure | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (hitId) params.set("hit", hitId);
    if (alertId) params.set("alert", alertId);
    if (customerRecordId) params.set("customer", customerRecordId);
    let cancelled = false;
    setRecord(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/development/case?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json()) as OpenedRecord & DeskFailure;
        if (cancelled) return;
        if (!response.ok) {
          setError({ error: body.error || "The development record could not be read.", detail: body.detail });
          return;
        }
        setRecord(body);
      } catch {
        if (!cancelled) setError({ error: "The development record could not be read." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alertId, customerRecordId, hitId]);

  if (error) {
    return (
      <p data-testid="dev-record-error" className="text-sm text-destructive">
        {error.error}
      </p>
    );
  }
  if (!record) {
    return (
      <p data-testid="dev-record-loading" className="text-sm text-muted-foreground">
        Reading the development files…
      </p>
    );
  }

  return (
    <div data-testid="dev-record" className="grid gap-3">
      <RecordCard record={record.customer} testId={record.customer?.present ? "customer-record" : "customer-missing"} />
      {record.accounts.map((account) => (
        <RecordCard key={account.id} record={account} testId={`account-${account.id}`} />
      ))}
      {record.notes.map((note) => (
        <RecordCard key={note.id} record={note} testId={`note-${note.id}`} />
      ))}
      {record.checks.map((check) => (
        <RecordCard key={check.id} record={check} testId={`check-${check.id}`} />
      ))}
      <RecordCard record={record.hit} testId="hit-record" />
      <RecordCard record={record.alert} testId="alert-record" />
    </div>
  );
}

function RecordCard({ record, testId }: { record: SourcedRecord | null; testId: string }) {
  if (!record) return null;
  if (!record.present) {
    return (
      <div data-testid={testId} className="border border-border bg-card px-5 py-4">
        <p className="font-mono text-sm text-foreground">{record.id}</p>
        <p className="mt-1 text-sm leading-6 text-foreground">{record.message}</p>
      </div>
    );
  }
  return (
    <Card data-testid={testId} className="bg-card">
      <CardHeader>
        <CardDescription>
          {record.kind} · {record.file}
        </CardDescription>
        <CardTitle className="font-mono text-base">{record.id}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-y-1.5 text-sm">
          {record.fields.map((field) => (
            <div key={field.label} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="max-h-48 min-w-0 overflow-auto break-words text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
