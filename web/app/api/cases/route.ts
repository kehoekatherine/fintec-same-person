import { connection } from "next/server";
import { NextResponse } from "next/server";

import { clearDevelopmentRun } from "@/lib/dev-run";
import { DeskError } from "@/lib/errors";
import { loadExamples } from "@/lib/examples";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The resolver failed.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await loadExamples());
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  await connection();
  const text = await request.text();
  if (text.trim()) {
    return NextResponse.json(
      {
        error: "This desk re-runs the development data folder. It does not accept an upload here.",
      },
      { status: 400 },
    );
  }
  clearDevelopmentRun();
  try {
    return NextResponse.json(await loadExamples());
  } catch (error) {
    return failure(error);
  }
}
