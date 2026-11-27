import { createHash } from "node:crypto";

export { parseCsv } from "@/lib/csv-text";

export function stableId(prefix: string, seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 10).toUpperCase();
  return `${prefix}-${digest}`;
}
