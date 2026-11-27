/**
 * Public list prices copied from the alert-triage cost page.
 * They are provider list prices, not a bill for this screening run, and no model was called here.
 */
export type ModelHosting = "closed" | "groq" | "deepseek-api";

export type ModelPrice = {
  id: string;
  label: string;
  chartLabel: string;
  provider: string;
  hosting: ModelHosting;
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
  source: string;
  sourceNote: string;
  publishedOutputTokensPerSec: number | null;
  assumedOutputTokensPerSec: number;
  speedNote: string;
};

export const PRICE_CHECKED = "26 Nov 2026";

export const CURRENCY_NOTE =
  "Token prices are US dollars from the provider pages below. The page converts to GBP only through an editable rate, which is an assumption, not a live FX quote.";

export const OUTPUT_TOKENS_NOTE =
  "400 output tokens is an assumption, not a measured model response. The rules engine's own reasons on this run are the measured figure beside it. 400 allows a short JSON verdict with a two-to-four sentence reason.";

export const MODEL_PRICES: ModelPrice[] = [
  {
    id: "gpt-4o",
    label: "GPT-4o",
    chartLabel: "GPT-4o",
    provider: "OpenAI",
    hosting: "closed",
    inputUsdPerMtok: 2.5,
    outputUsdPerMtok: 10,
    source: "https://developers.openai.com/api/docs/pricing",
    sourceNote:
      "Standard tier on OpenAI's pricing page, checked 26 Nov 2026. The model page also lists GPT-4o as deprecated; the price list still publishes $2.50 input and $10 output per 1M tokens.",
    publishedOutputTokensPerSec: null,
    assumedOutputTokensPerSec: 40,
    speedNote:
      "OpenAI's pricing page does not publish a tokens-per-second figure. 40 is an editable assumption, not a measurement.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    chartLabel: "Claude",
    provider: "Anthropic",
    hosting: "closed",
    inputUsdPerMtok: 2,
    outputUsdPerMtok: 10,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    sourceNote:
      "Claude API standard global list price, checked 26 Nov 2026. Anthropic's rate card dated 9 Nov 2026 shows the same $2 input and $10 output per 1M tokens.",
    publishedOutputTokensPerSec: null,
    assumedOutputTokensPerSec: 50,
    speedNote:
      "The pricing page calls the model fast but does not publish tokens per second. 50 is an editable assumption, not a measurement.",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    chartLabel: "Gemini",
    provider: "Google",
    hosting: "closed",
    inputUsdPerMtok: 0.75,
    outputUsdPerMtok: 3.75,
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    sourceNote:
      "Paid standard tier, checked 26 Nov 2026. Google lists $0.75 input and $3.75 output per 1M tokens through 31 Dec 2026, then $1.50 and $7.50. Output price includes thinking tokens.",
    publishedOutputTokensPerSec: null,
    assumedOutputTokensPerSec: 80,
    speedNote: "No tokens-per-second figure is on the pricing page. 80 is an editable assumption, not a measurement.",
  },
  {
    id: "llama-3.3-70b-groq",
    label: "Llama 3.3 70B (open weight)",
    chartLabel: "Llama",
    provider: "Groq (hosted open weights)",
    hosting: "groq",
    inputUsdPerMtok: 0.59,
    outputUsdPerMtok: 0.79,
    source: "https://home.cloud.groq.io/pricing",
    sourceNote:
      "Groq on-demand price list for Llama 3.3 70B Versatile, checked 26 Nov 2026: $0.59 input and $0.79 output per 1M tokens, listed speed 394 tokens per second. This is hosted inference, not a self-hosted GPU cost.",
    publishedOutputTokensPerSec: 394,
    assumedOutputTokensPerSec: 394,
    speedNote:
      "394 tokens/sec is Groq's published on-demand speed for this model, checked 26 Nov 2026. Generation time below uses that figure. It is not a latency measured on these hits.",
  },
  {
    id: "deepseek-v4-1-flash",
    label: "DeepSeek V4.1 Flash (hosted API)",
    chartLabel: "DeepSeek",
    provider: "DeepSeek",
    hosting: "deepseek-api",
    inputUsdPerMtok: 0.3,
    outputUsdPerMtok: 1.2,
    source: "https://api-docs.deepseek.com/quick_start/pricing/",
    sourceNote:
      "DeepSeek API list price, read 27 Nov 2026. This row uses the cache-miss peak rate for deepseek-flash (DeepSeek-V4.1-Flash): $0.30 input and $1.20 output per 1M tokens. Off-peak is half of that. This is a hosted API, not a self-hosted GPU cost.",
    publishedOutputTokensPerSec: null,
    assumedOutputTokensPerSec: 40,
    speedNote:
      "The pricing page does not publish tokens per second. 40 is the same assumption used when a provider gives no speed. It is not a measurement on these hits.",
  },
];

export function caseUsd(inputTokens: number, outputTokens: number, model: ModelPrice): number {
  return (inputTokens / 1_000_000) * model.inputUsdPerMtok + (outputTokens / 1_000_000) * model.outputUsdPerMtok;
}
