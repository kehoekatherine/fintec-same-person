import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { findDevPack } from "./data-pack.ts";
import type { Decision, PracticeLabel, ResultPayload } from "./types.ts";

const DECISIONS = new Set<Decision>(["DIFFERENT_ENTITY", "SAME_ENTITY", "REVIEW"]);

function isLabelDecision(value: string): value is Decision {
  return DECISIONS.has(value as Decision);
}

/** The label file validate.py scores with --score. */
export const PRACTICE_LABEL_FILE = "practice_labels.jsonl";

/**
 * A second label file, only when the folder already contains one.
 * These names are not a split of the practice file.
 */
export const HELD_OUT_LABEL_FILES = [
  "heldout_labels.jsonl",
  "holdout_labels.jsonl",
  "held_out_labels.jsonl",
  "unseen_labels.jsonl",
] as const;

export const LOCAL_DATASET_NAME = "Dataset found on this machine";

export type LabelSets = {
  labels: PracticeLabel[];
  heldOutLabels: PracticeLabel[] | null;
  practiceFile: string | null;
  heldOutFile: string | null;
};

/** JSONL labels. A decision must already be SAME_ENTITY, DIFFERENT_ENTITY, or REVIEW. */
export function parseLabelText(text: string): PracticeLabel[] {
  const labels: PracticeLabel[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: unknown;
    try {
      row = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    const label = labelFrom(row);
    if (!label || seen.has(label.hitId)) continue;
    seen.add(label.hitId);
    labels.push(label);
  }
  return labels;
}

export function labelsFromRows(value: unknown): PracticeLabel[] {
  if (!Array.isArray(value)) return [];
  const labels: PracticeLabel[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const label = labelFrom(item);
    if (!label || seen.has(label.hitId)) continue;
    seen.add(label.hitId);
    labels.push(label);
  }
  return labels;
}

function labelFrom(value: unknown): PracticeLabel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { hit_id?: unknown; decision?: unknown };
  if (typeof record.hit_id !== "string" || record.hit_id.length === 0) return null;
  if (typeof record.decision !== "string" || !isLabelDecision(record.decision)) return null;
  return { hitId: record.hit_id, decision: record.decision };
}

/**
 * Read the label files that are actually in this folder.
 * One file, or none, means overfitting is not measured.
 */
export async function readLabelSets(dir: string): Promise<LabelSets> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return { labels: [], heldOutLabels: null, practiceFile: null, heldOutFile: null };
  }
  const present = new Set(names);
  const practiceFile = present.has(PRACTICE_LABEL_FILE) ? PRACTICE_LABEL_FILE : null;
  const heldOutFile = HELD_OUT_LABEL_FILES.find((name) => present.has(name)) ?? otherLabelFile(names, practiceFile);
  const practice = practiceFile ? await readLabelFile(dir, practiceFile) : [];
  const heldOut = heldOutFile ? await readLabelFile(dir, heldOutFile) : [];
  if (practice.length > 0 && heldOut.length > 0 && practiceFile && heldOutFile) {
    return { labels: practice, heldOutLabels: heldOut, practiceFile, heldOutFile };
  }
  if (practice.length > 0) {
    return { labels: practice, heldOutLabels: null, practiceFile, heldOutFile: null };
  }
  if (heldOut.length > 0 && heldOutFile) {
    return { labels: heldOut, heldOutLabels: null, practiceFile: heldOutFile, heldOutFile: null };
  }
  const single = names.find((name) => name.endsWith("labels.jsonl"));
  if (single) {
    const labels = await readLabelFile(dir, single);
    if (labels.length > 0) {
      return { labels, heldOutLabels: null, practiceFile: single, heldOutFile: null };
    }
  }
  return { labels: [], heldOutLabels: null, practiceFile: null, heldOutFile: null };
}

/** A second *labels.jsonl next to practice_labels.jsonl is the folder's held-out file. */
function otherLabelFile(names: string[], practiceFile: string | null): string | null {
  if (!practiceFile) return null;
  const others = names.filter((name) => name !== practiceFile && name.endsWith("labels.jsonl")).sort();
  return others.length === 1 ? others[0] : null;
}

async function readLabelFile(dir: string, name: string): Promise<PracticeLabel[]> {
  try {
    return parseLabelText(await readFile(path.join(dir, name), "utf8"));
  } catch {
    return [];
  }
}

/** Attach this folder's labels to a development run. Does not open another dataset. */
export async function attachFolderLabels(payload: ResultPayload): Promise<ResultPayload> {
  const dir = await findDevPack();
  if (!dir) return { ...payload, datasetName: LOCAL_DATASET_NAME };
  const sets = await readLabelSets(dir);
  return {
    ...payload,
    datasetName: LOCAL_DATASET_NAME,
    labels: sets.labels.length > 0 ? sets.labels : undefined,
    heldOutLabels: sets.heldOutLabels ?? undefined,
  };
}
