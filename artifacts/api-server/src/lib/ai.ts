import Groq from "groq-sdk";
import { logger } from "./logger";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type ProviderType = "groq" | "openrouter" | "gemini" | "openai" | "anthropic" | "custom";

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
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";

// Gemini uses an OpenAI-compatible endpoint
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

async function callGroq(messages: ChatMessage[], opts: CompletionOptions): Promise<CompletionResult> {
  const model = opts.model ?? GROQ_DEFAULT_MODEL;
  const response = await groq.chat.completions.create({
    model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
  });
  return {
    content: response.choices[0].message.content ?? "",
    model,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: CompletionOptions,
  extraHeaders: Record<string, string> = {}
): Promise<CompletionResult> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens: number };
    model: string;
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    model: data.model ?? model,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  providerType: ProviderType = "groq",
  opts: CompletionOptions = {}
): Promise<CompletionResult> {
  try {
    if (providerType === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
      return await callOpenAICompatible(
        GEMINI_BASE_URL, apiKey,
        opts.model ?? GEMINI_DEFAULT_MODEL,
        messages, opts
      );
    }

    if (providerType === "openrouter") {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
      return await callOpenAICompatible(
        OPENROUTER_BASE_URL, apiKey,
        opts.model ?? OPENROUTER_DEFAULT_MODEL,
        messages, opts,
        { "HTTP-Referer": "https://algdevs-ai.replit.app", "X-Title": "AlgDevs-AI" }
      );
    }

    return await callGroq(messages, opts);
  } catch (err) {
    logger.warn({ err, providerType }, "Primary provider failed, falling back to Groq");
    if (providerType !== "groq") {
      return await callGroq(messages, { ...opts, model: undefined });
    }
    throw err;
  }
}

export async function testProviderHealth(
  providerType: ProviderType,
  model?: string
): Promise<{ success: boolean; latencyMs: number; model: string | null; error: string | null }> {
  const start = Date.now();
  try {
    const result = await chatCompletion(
      [{ role: "user", content: "Reply with just: OK" }],
      providerType,
      { model, maxTokens: 10 }
    );
    return { success: true, latencyMs: Date.now() - start, model: result.model, error: null };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      model: model ?? null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
