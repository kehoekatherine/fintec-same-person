import { connection } from "next/server";
import { NextResponse } from "next/server";

import { PUBLIC_PACK_UNAVAILABLE, publishedHost } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The development record could not be read.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function GET(request: Request) {
  await connection();
  if (publishedHost()) {
    return NextResponse.json({ error: PUBLIC_PACK_UNAVAILABLE }, { status: 404 });
  }
  const url = new URL(request.url);
  try {
    const { loadCaseFacts } = await import("@/lib/case-facts");
    const { openDevelopmentRecord } = await import("@/lib/dev-case");
    const hitId = url.searchParams.get("hit");
    const alertId = url.searchParams.get("alert");
    const customerRecordId = url.searchParams.get("customer");
    const evidenceIds = url.searchParams.getAll("evidence");
    const [record, facts] = await Promise.all([
      openDevelopmentRecord({ hitId, alertId, customerRecordId }),
      loadCaseFacts({ hitId, alertId, customerRecordId, evidenceIds }),
    ]);
    return NextResponse.json({ ...record, facts });
  } catch (error) {
    return failure(error);
  }
}
