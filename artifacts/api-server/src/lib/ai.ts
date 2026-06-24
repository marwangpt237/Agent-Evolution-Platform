import Groq from "groq-sdk";
import { logger } from "./logger";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type ProviderType = "groq" | "gemini" | "openrouter" | "openai" | "anthropic" | "custom";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
}

const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

const GROQ_MODEL_ALIASES: Record<string, string> = {
  gemini: GROQ_DEFAULT_MODEL,
  openrouter: GROQ_DEFAULT_MODEL,
  openai: GROQ_DEFAULT_MODEL,
  anthropic: GROQ_DEFAULT_MODEL,
};

async function callGroq(
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const model = opts.model ?? GROQ_DEFAULT_MODEL;
  const response = await groq.chat.completions.create({
    model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
  });
  const choice = response.choices[0];
  return {
    content: choice.message.content ?? "",
    model,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  providerType: ProviderType = "groq",
  opts: CompletionOptions = {}
): Promise<CompletionResult> {
  // All providers route through Groq (free tier — no other provider configured)
  const model = opts.model ?? GROQ_MODEL_ALIASES[providerType] ?? GROQ_DEFAULT_MODEL;
  return callGroq(messages, { ...opts, model });
}

export async function testProviderHealth(
  providerType: ProviderType,
  model?: string
): Promise<{ success: boolean; latencyMs: number; model: string | null; error: string | null }> {
  if (providerType !== "groq") {
    return {
      success: false,
      latencyMs: 0,
      model: model ?? null,
      error: "Only Groq is configured. Other providers require a paid Replit plan.",
    };
  }
  const start = Date.now();
  try {
    const result = await callGroq(
      [{ role: "user", content: "Reply with just: OK" }],
      { model, maxTokens: 10 }
    );
    return { success: true, latencyMs: Date.now() - start, model: result.model, error: null };
  } catch (err) {
    logger.error({ err }, "Groq health check failed");
    return {
      success: false,
      latencyMs: Date.now() - start,
      model: model ?? null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
