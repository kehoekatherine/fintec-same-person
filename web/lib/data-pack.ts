import { access, realpath } from "node:fs/promises";
import path from "node:path";

export const MISSING_DATA_FOLDER = "The data folder is not on this machine.";

/** Files system/run reads from a development folder. */
export const DEV_PACK_FILES = [
  "customers.jsonl",
  "accounts.jsonl",
  "onboarding.jsonl",
  "kyc_checks.jsonl",
  "notes.jsonl",
  "alerts.jsonl",
  "hits.jsonl",
  "search_results.jsonl",
  "name_variants.json",
] as const;

/**
 * The unpacked development folder, when it is on this machine.
 * The repository does not contain that folder. SCREENING_DEV_DIR overrides the default location.
 */
export async function findDevPack(): Promise<string | null> {
  const candidates = [process.env.SCREENING_DEV_DIR, "/tmp/hackathon-data/unpacked/screening/dev"].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  for (const candidate of candidates) {
    try {
      const directory = await realpath(candidate);
      if (directory.includes(`${path.sep}fixtures${path.sep}brief`)) continue;
      await Promise.all(DEV_PACK_FILES.map((file) => access(path.join(directory, file))));
      return directory;
    } catch {
      continue;
    }
  }
  return null;
}
