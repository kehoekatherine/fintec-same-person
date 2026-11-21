import { readFile } from "node:fs/promises";
import path from "node:path";

import { findDevPack, publishedHost } from "./data-pack.ts";
import { labelsOnRows } from "./model-fitness.ts";
import { isDecision } from "./resolutions.ts";
import type { Decision, PracticeLabel, ResultPayload } from "./types.ts";

/**
 * True decisions for the practice hits.
 * A published host returns null and does not open the file.
 */
export async function loadPracticeLabels(): Promise<Map<string, Decision> | null> {
  if (publishedHost()) return null;
  const dir = await findDevPack();
  if (!dir) return null;
  try {
    return parseLabelFile(await readFile(path.join(dir, "practice_labels.jsonl"), "utf8"));
  } catch {
    return null;
  }
}

/** Attach practice labels. Does not run the resolver. An upload keeps only labels for hits in that file. */
export async function annotateModelFitness(payload: ResultPayload): Promise<ResultPayload> {
  const labels = await loadPracticeLabels();
  if (!labels || labels.size === 0) return payload;
  const list = [...labels].map(([hitId, decision]) => ({ hitId, decision }));
  if (payload.source === "upload") {
    const matched = labelsOnRows(payload.rows, list);
    return matched ? { ...payload, labels: matched } : payload;
  }
  return { ...payload, labels: list };
}

function parseLabelFile(text: string): Map<string, Decision> {
  const labels = new Map<string, Decision>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: { hit_id?: unknown; decision?: unknown };
    try {
      row = JSON.parse(trimmed) as { hit_id?: unknown; decision?: unknown };
    } catch {
      continue;
    }
    if (typeof row.hit_id !== "string" || !row.hit_id || typeof row.decision !== "string" || !isDecision(row.decision)) {
      continue;
    }
    if (!labels.has(row.hit_id)) labels.set(row.hit_id, row.decision);
  }
  return labels;
}

export type { PracticeLabel };
