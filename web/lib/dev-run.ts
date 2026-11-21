import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { parseCsv } from "@/lib/csv";
import { findDevPack } from "@/lib/data-pack";
import { DeskError } from "@/lib/errors";
import { loadApplicableCodes } from "@/lib/grounds";
import { runEngineOn } from "@/lib/engine";
import { customerPresence, loadPackIndex, type PackIndex } from "@/lib/pack-index";
import { stringOf } from "@/lib/record-fields";
import { parseResolutions } from "@/lib/resolutions";
import type { Resolution, ResultPayload, ResultRow } from "@/lib/types";
import { toResultRow } from "@/lib/upload";

let freshRun: { dir: string; pending: Promise<Resolution[]> } | null = null;

export async function loadDevelopmentRun(): Promise<ResultPayload> {
  const indexPromise = loadPackIndex().catch(() => null);
  const dir = await findDevPack();
  let fresh = false;
  let resolutions: Resolution[];
  if (dir) {
    try {
      resolutions = await freshResolutions(dir);
      fresh = true;
    } catch (error) {
      if (error instanceof DeskError && error.code === "missing") {
        resolutions = await readCommitted();
      } else {
        throw error;
      }
    }
  } else {
    resolutions = await readCommitted();
  }
  const index = await indexPromise;
  const confirmed = index ? new Map() : await loadConfirmedNames();
  const codes = dir ? await loadApplicableCodes(dir, 120_000) : null;
  const rows = resolutions.map((row) => decorate(row, index, confirmed, codes));
  return {
    source: "development",
    mode: fresh ? "scored" : "recorded",
    notice: noticeFor(fresh, Boolean(dir), confirmed.size > 0 && !index),
    rows,
  };
}

function decorate(
  row: Resolution,
  index: PackIndex | null,
  confirmed: Map<string, Pick<ResultRow, "name" | "listedName" | "customerDob" | "customerCountry">>,
  codes: Map<string, string[]> | null,
): ResultRow {
  const result = toResultRow(row);
  const applicable = codes?.get(row.hit_id);
  result.groundsChecked = applicable != null;
  result.applicableCodes = applicable ?? [];
  result.customerInFile = customerPresence(index, result.customerRecordId);
  if (index) {
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
  const match = confirmed.get(row.hit_id);
  if (!match) return result;
  return { ...result, ...match };
}

function noticeFor(fresh: boolean, pack: boolean, usedCsv: boolean): string {
  if (fresh) {
    return "Development run from system/run on the development data folder. Open a row to read the customer, account, and hit from that folder. An id that is not in customers.jsonl is not opened as a customer. The fictional brief is a separate queue.";
  }
  if (pack) {
    return "The development folder is on this machine, but the Python resolver is not available, so these are the recorded decisions in output/dev.jsonl. Open a row to read the customer, account, and hit from that folder. The fictional brief is a separate queue.";
  }
  if (usedCsv) {
    return "Recorded decisions from output/dev.jsonl. Confirmed matches include names from output/confirmed-matches.csv because the development customers.jsonl is not on this machine. The fictional brief is a separate queue.";
  }
  return "Recorded decisions from output/dev.jsonl. The development customers.jsonl is not on this machine, so a customer id cannot be opened from that file. The fictional brief is a separate queue.";
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

async function loadConfirmedNames(): Promise<
  Map<string, Pick<ResultRow, "name" | "listedName" | "customerDob" | "customerCountry">>
> {
  const file = await resolveOutputFile("confirmed-matches.csv");
  const names = new Map<string, Pick<ResultRow, "name" | "listedName" | "customerDob" | "customerCountry">>();
  if (!file) return names;
  const table = parseCsv(await readFile(file, "utf8"));
  const header = table[0]?.map((cell) => cell.trim().toLowerCase());
  if (!header || !header.includes("hit_id") || !header.includes("customer_name")) {
    throw new DeskError("output/confirmed-matches.csv needs hit_id and customer_name columns.", { status: 500 });
  }
  const index = (column: string) => header.indexOf(column);
  const hitIndex = index("hit_id");
  for (const cells of table.slice(1)) {
    const hitId = cells[hitIndex]?.trim();
    if (!hitId || names.has(hitId)) continue;
    names.set(hitId, {
      name: cell(cells, index("customer_name")),
      listedName: cell(cells, index("listed_name")),
      customerDob: cell(cells, index("customer_dob")),
      customerCountry: cell(cells, index("customer_country")),
    });
  }
  return names;
}

function cell(cells: string[], index: number): string | null {
  if (index < 0) return null;
  const value = cells[index]?.trim();
  return value ? value : null;
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
