import { connection } from "next/server";
import { NextResponse } from "next/server";

import { modelReason, type ReasonFact, type ReasonRequest } from "@/lib/model-reason";

const MAX_BODY = 16_000;

export async function POST(request: Request) {
  await connection();
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY) {
    return NextResponse.json({ error: "The reasoning request is too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "The reasoning request is too large." }, { status: 413 });
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "The reasoning request could not be read." }, { status: 400 });
  }
  const input = readRequest(body);
  if (!input) {
    return NextResponse.json({ error: "The reasoning request is missing the comparison." }, { status: 400 });
  }
  try {
    const result = await modelReason(input);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "The model did not answer." }, { status: 502 });
  }
}

function readRequest(body: unknown): ReasonRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const decision = stringOf(record.decision);
  const reason = stringOf(record.reason);
  if (!decision || !reason) return null;
  const facts = Array.isArray(record.facts) ? record.facts.flatMap(readFact) : [];
  return {
    hitId: stringOf(record.hitId) ?? "",
    decision,
    reasonCode: stringOf(record.reasonCode) ?? "",
    reason,
    facts,
  };
}

function readFact(value: unknown): ReasonFact[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const label = stringOf(row.label);
  if (!label) return [];
  return [
    {
      label,
      customer: stringOf(row.customer) ?? "Not given",
      hit: stringOf(row.hit) ?? "Not given",
      status: stringOf(row.status) ?? "Undefined",
    },
  ];
}

function stringOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}
