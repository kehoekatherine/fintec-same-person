import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

let loading: Promise<Set<string> | null> | null = null;

/**
 * Record ids in the development customers.jsonl, when that file is on this machine.
 * Null means the file was not read. The file is never copied into the repository.
 */
export function loadCustomerIds(): Promise<Set<string> | null> {
  if (!loading) {
    loading = readIds().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Customer ids from `ids` that are not rows in customers.jsonl. Null when that file was not read. */
export async function absentCustomerIds(ids: Iterable<string | null | undefined>): Promise<string[] | null> {
  const known = await loadCustomerIds();
  if (!known) return null;
  const absent: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || !id.startsWith("CUS-") || seen.has(id)) continue;
    seen.add(id);
    if (!known.has(id)) absent.push(id);
  }
  return absent;
}

async function readIds(): Promise<Set<string> | null> {
  const candidates = [process.env.SCREENING_DEV_DIR, "/tmp/hackathon-data/unpacked/screening/dev"].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  for (const candidate of candidates) {
    try {
      const directory = await realpath(candidate);
      if (directory.includes(`${path.sep}fixtures${path.sep}brief`)) continue;
      const file = path.join(directory, "customers.jsonl");
      await access(file);
      const text = await readFile(file, "utf8");
      const ids = new Set<string>();
      for (const line of text.split("\n")) {
        if (!line.includes("\"record_id\"")) continue;
        const row = JSON.parse(line) as { record_id?: unknown };
        if (typeof row.record_id === "string" && row.record_id.trim()) ids.add(row.record_id.trim());
      }
      return ids;
    } catch {
      continue;
    }
  }
  return null;
}
