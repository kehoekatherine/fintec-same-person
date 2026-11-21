import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { MISSING_DATA_FOLDER, findDevPack } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";
import { loadApplicableCodes } from "@/lib/grounds";
import { runEngineOn } from "@/lib/engine";
import { customerPresence, loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { stringOf } from "@/lib/record-fields";
import { parseResolutions } from "@/lib/resolutions";
import type { Resolution, ResultPayload, ResultRow } from "@/lib/types";
import { toResultRow } from "@/lib/upload";

let freshRun: { dir: string; pending: Promise<Resolution[]> } | null = null;

export function clearDevelopmentRun(): void {
  freshRun = null;
}

export async function loadResolutions(): Promise<{ rows: Resolution[]; fresh: boolean }> {
  const dir = await findDevPack();
  if (!dir) throw new DeskError(MISSING_DATA_FOLDER, { status: 404 });
  try {
    return { rows: await freshResolutions(dir), fresh: true };
  } catch (error) {
    if (error instanceof DeskError && error.code === "missing") {
      return { rows: await readCommitted(), fresh: false };
    }
    throw error;
  }
}

export async function loadDevelopmentRun(): Promise<ResultPayload> {
  const dir = await findDevPack();
  if (!dir) throw new DeskError(MISSING_DATA_FOLDER, { status: 404 });
  const [resolved, index, codes] = await Promise.all([
    loadResolutions(),
    loadPackIndex(),
    loadApplicableCodes(dir, 120_000),
  ]);
  if (!index) throw new DeskError(MISSING_DATA_FOLDER, { status: 404 });
  return {
    source: "development",
    mode: resolved.fresh ? "scored" : "recorded",
    notice: resolved.fresh
      ? "Decisions from system/run. An id missing from customers.jsonl is not opened as a customer."
      : "The Python resolver is not available, so these are the recorded decisions in output/dev.jsonl.",
    rows: resolved.rows.map((row) => decorate(row, index, codes)),
  };
}

function decorate(row: Resolution, index: PackIndex, codes: Map<string, string[]> | null): ResultRow {
  const result = toResultRow(row);
  const applicable = codes?.get(row.hit_id);
  result.groundsChecked = applicable != null;
  result.applicableCodes = applicable ?? [];
  result.customerInFile = customerPresence(index, result.customerRecordId);
  result.customerMissing = result.customerInFile === false;
  const customer =
    result.customerRecordId && result.customerInFile ? index.customers.get(result.customerRecordId) : undefined;
  const hit = index.hits.get(row.hit_id);
  if (customer) {
    result.name = stringOf(customer.full_name);
    result.customerDob = stringOf(customer.dob);
    result.customerCountry = stringOf(customer.residence_country);
  }
  if (hit) result.listedName = stringOf(hit.name);
  return result;
}

function freshResolutions(dir: string): Promise<Resolution[]> {
  if (!freshRun || freshRun.dir !== dir) {
    const pending = runEngineOn(dir, 180_000, {
      allowDevPack: true,
      missingMessage: "The Python resolver is not available, so the development folder cannot be re-run.",
    }).catch((error: unknown) => {
      if (freshRun?.pending === pending) freshRun = null;
      throw error;
    });
    freshRun = { dir, pending };
  }
  return freshRun.pending;
}

async function readCommitted(): Promise<Resolution[]> {
  const file = await resolveOutputFile("dev.jsonl");
  if (!file) {
    throw new DeskError("The development run output/dev.jsonl is not in this deployment.", { status: 404 });
  }
  return parseResolutions(await readFile(file, "utf8"));
}

async function resolveOutputFile(filename: string): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), "..", "output", filename),
    path.resolve(process.cwd(), "output", filename),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
    } catch {
      continue;
    }
    const real = await realpath(candidate);
    if (real.includes("hackathon-data")) continue;
    if (path.basename(real) !== filename || path.basename(path.dirname(real)) !== "output") continue;
    return real;
  }
  return null;
}
