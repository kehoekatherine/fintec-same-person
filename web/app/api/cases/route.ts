import { connection } from "next/server";
import { NextResponse } from "next/server";

import { DeskError, loadDesk } from "@/lib/desk";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "The resolver failed.";
  const detail = error instanceof DeskError ? error.detail : undefined;
  const status = error instanceof DeskError ? error.status : 500;
  return NextResponse.json({ error: message, detail }, { status });
}

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await loadDesk({ allowSnapshot: true }));
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
        error:
          "This desk only re-runs the fictional brief fixture. It does not accept a data folder or an upload.",
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await loadDesk({ allowSnapshot: false }));
  } catch (error) {
    return failure(error);
  }
}
