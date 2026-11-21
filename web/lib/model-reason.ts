import { createHash } from "node:crypto";

import { publishedHost } from "@/lib/data-pack";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const cache = new Map<string, string>();

export type ReasonFact = {
  label: string;
  customer: string;
  hit: string;
  status: string;
};

export type ReasonRequest = {
  hitId: string;
  decision: string;
  reasonCode: string;
  reason: string;
  facts: ReasonFact[];
};

export type ReasonResult = {
  text: string;
  source: "model" | "rules" | "unavailable";
};

export function modelConfigured(): boolean {
  return Boolean((process.env.OPENROUTER_API_KEY || "").trim()) && !publishedHost();
}

export async function modelReason(input: ReasonRequest): Promise<ReasonResult> {
  if (publishedHost()) {
    return {
      text: "Model reasoning is not available on the public desk.",
      source: "unavailable",
    };
  }
  const key = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!key) {
    return { text: input.reason, source: "rules" };
  }
  const prompt = promptFor(input);
  const digest = createHash("sha256").update(prompt).digest("hex");
  const cached = cache.get(digest);
  if (cached) return { text: cached, source: "model" };
  const text = await ask(key, prompt);
  cache.set(digest, text);
  return { text, source: "model" };
}

export function promptFor(input: ReasonRequest): string {
  const lines = input.facts.slice(0, 12).map((fact) => {
    return `${clip(fact.label)}: customer ${clip(fact.customer)} | hit ${clip(fact.hit)} | ${clip(fact.status)}`;
  });
  return [
    "Explain this screening comparison in three short sentences.",
    "The decision is already made. Do not change it and do not name a different decision.",
    "Use only the facts below. Say what agrees, what differs, and what could not be compared.",
    `Decision: ${clip(input.decision)}`,
    `Reason code: ${clip(input.reasonCode)}`,
    `Rule: ${clip(input.reason, 500)}`,
    ...lines,
  ].join("\n");
}

function clip(value: string, max = 120): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function ask(apiKey: string, prompt: string): Promise<string> {
  const model = (process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini").trim();
  const body = {
    model,
    temperature: 0,
    seed: 0,
    max_tokens: 180,
    messages: [{ role: "user", content: prompt }],
  };
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("The model did not answer.");
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The model did not answer.");
  }
  return content.trim().slice(0, 900);
}
