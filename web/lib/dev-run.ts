import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { absentCustomerIds } from "@/lib/customer-file";
import { parseCsv } from "@/lib/csv";
import { DeskError } from "@/lib/errors";
import { parseResolutions } from "@/lib/resolutions";
import type { ResultPayload, ResultRow } from "@/lib/types";
import { toResultRow } from "@/lib/upload";

export async function loadDevelopmentRun(): Promise<ResultPayload> {
  const file = await resolveOutputFile("dev.jsonl");
  if (!file) {
    throw new DeskError("The development run output/dev.jsonl is not in this deployment.", { status: 404 });
  }
  const text = await readFile(file, "utf8");
  const confirmed = await loadConfirmedNames();
  const rows = parseResolutions(text).map((row) => {
    const result = toResultRow(row);
    const match = confirmed.get(row.hit_id);
    if (!match) return result;
    return { ...result, ...match };
  });
  const cited = rows.flatMap((row) => [row.customerRecordId, ...row.evidence]);
  return {
    source: "development",
    mode: "recorded",
    notice: confirmed.size
      ? "Recorded decisions from output/dev.jsonl. Confirmed matches include the customer and listed names from output/confirmed-matches.csv. The customer files are not in the repository. This is not a live watchlist and not a regulatory filing."
      : "Recorded decisions from output/dev.jsonl. The customer files for this run are not in the repository. This is not a live watchlist and not a regulatory filing.",
    rows,
    absentCustomerIds: await absentCustomerIds(cited),
  };
}

async function loadConfirmedNames(): Promise<Map<string, Pick<ResultRow, "name" | "listedName" | "customerDob" | "customerCountry">>> {
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
    if (real.includes("hackathon-data")) {
      throw new DeskError("The desk does not read the private data pack.", { status: 500 });
    }
    if (path.basename(real) !== filename || path.basename(path.dirname(real)) !== "output") continue;
    return real;
  }
  return null;
}
