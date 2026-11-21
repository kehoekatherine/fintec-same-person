import { connection } from "next/server";
import { NextResponse } from "next/server";

import { loadCaseFacts } from "@/lib/case-facts";
import { openDevelopmentRecord } from "@/lib/dev-case";
import { DeskError } from "@/lib/errors";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The development record could not be read.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  try {
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
