import { connection } from "next/server";
import { NextResponse } from "next/server";

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
    return NextResponse.json(
      await openDevelopmentRecord({
        hitId: url.searchParams.get("hit"),
        alertId: url.searchParams.get("alert"),
        customerRecordId: url.searchParams.get("customer"),
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
