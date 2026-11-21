import { connection } from "next/server";
import { NextResponse } from "next/server";

import { findDevPack, MISSING_DATA_FOLDER, PUBLIC_PACK_UNAVAILABLE, publishedHost } from "@/lib/data-pack";
import { loadPracticeLabels } from "@/lib/practice-labels";

/** Practice-label decisions for the local desk. Does not run the resolver. */
export async function GET() {
  await connection();
  if (publishedHost()) {
    return NextResponse.json({ error: PUBLIC_PACK_UNAVAILABLE }, { status: 404 });
  }
  const labels = await loadPracticeLabels();
  if (!labels) {
    const dir = await findDevPack();
    if (!dir) return NextResponse.json({ error: MISSING_DATA_FOLDER }, { status: 404 });
    return NextResponse.json({ labels: [] });
  }
  return NextResponse.json({
    labels: [...labels].map(([hitId, decision]) => ({ hitId, decision })),
  });
}
