import { readFile } from "node:fs/promises";
import path from "node:path";

import { findDevPack } from "@/lib/data-pack";
import { stringOf, type Row } from "@/lib/record-fields";

export type PackIndex = {
  dir: string;
  customers: Map<string, Row>;
  accountsById: Map<string, Row>;
  accountsByCustomer: Map<string, Row[]>;
  hits: Map<string, Row>;
  alerts: Map<string, Row>;
};

let loading: Promise<PackIndex | null> | null = null;

export function loadPackIndex(): Promise<PackIndex | null> {
  if (!loading) {
    loading = readIndex().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export function customerPresence(index: PackIndex | null, id: string | null): boolean | null {
  if (!id || id === "AMBIGUOUS") return null;
  if (!index) return null;
  return index.customers.has(id);
}

async function readIndex(): Promise<PackIndex | null> {
  const dir = await findDevPack();
  if (!dir) return null;
  const [customers, accounts, hits, alerts] = await Promise.all([
    readRows(path.join(dir, "customers.jsonl")),
    readRows(path.join(dir, "accounts.jsonl")),
    readRows(path.join(dir, "hits.jsonl")),
    readRows(path.join(dir, "alerts.jsonl")),
  ]);
  const customerMap = new Map<string, Row>();
  for (const row of customers) {
    const id = stringOf(row.record_id);
    if (id && !customerMap.has(id)) customerMap.set(id, row);
  }
  const accountsById = new Map<string, Row>();
  const accountsByCustomer = new Map<string, Row[]>();
  for (const row of accounts) {
    const id = stringOf(row.account_id);
    if (id && !accountsById.has(id)) accountsById.set(id, row);
    const customerId = stringOf(row.customer_id);
    if (!customerId) continue;
    const list = accountsByCustomer.get(customerId);
    if (list) list.push(row);
    else accountsByCustomer.set(customerId, [row]);
  }
  const hitMap = new Map<string, Row>();
  for (const row of hits) {
    const id = stringOf(row.hit_id);
    if (id && !hitMap.has(id)) hitMap.set(id, row);
  }
  const alertMap = new Map<string, Row>();
  for (const row of alerts) {
    const id = stringOf(row.alert_id);
    if (id && !alertMap.has(id)) alertMap.set(id, row);
  }
  return { dir, customers: customerMap, accountsById, accountsByCustomer, hits: hitMap, alerts: alertMap };
}

async function readRows(file: string): Promise<Row[]> {
  const text = await readFile(file, "utf8");
  const rows: Row[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Row);
  }
  return rows;
}
