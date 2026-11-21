import { connection } from "next/server";
import { NextResponse } from "next/server";

import { PUBLIC_PACK_UNAVAILABLE, publishedHost } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The development run could not be read.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function GET() {
  await connection();
  if (publishedHost()) {
    return NextResponse.json({ error: PUBLIC_PACK_UNAVAILABLE }, { status: 404 });
  }
  try {
    const { loadDevelopmentRun } = await import("@/lib/dev-run");
    return NextResponse.json(await loadDevelopmentRun());
  } catch (error) {
    return failure(error);
  }
}
