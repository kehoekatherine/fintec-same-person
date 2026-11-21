import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { DeskError } from "@/lib/errors";
import { parseResolutions } from "@/lib/resolutions";
import type { ResultPayload } from "@/lib/types";
import { toResultRow } from "@/lib/upload";

export async function loadDevelopmentRun(): Promise<ResultPayload> {
  const file = await resolveDevFile();
  const text = await readFile(file, "utf8");
  const rows = parseResolutions(text);
  return {
    source: "development",
    notice:
      "Recorded decisions from output/dev.jsonl. The customer files for this run are not in the repository. This is not a live watchlist and not a regulatory filing.",
    rows: rows.map((row) => toResultRow(row)),
  };
}

async function resolveDevFile(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "..", "output", "dev.jsonl"),
    path.resolve(process.cwd(), "output", "dev.jsonl"),
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
    if (path.basename(real) !== "dev.jsonl" || path.basename(path.dirname(real)) !== "output") continue;
    return real;
  }
  throw new DeskError("The development run output/dev.jsonl is not in this deployment.", { status: 404 });
}
