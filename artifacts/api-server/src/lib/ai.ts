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

async function callGroq(
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const model = opts.model ?? "openai/gpt-oss-120b";
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

async function callReplitProxy(
  providerType: ProviderType,
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const modelMap: Record<string, string> = {
    gemini: "gemini-2.0-flash",
    openrouter: "openai/gpt-4o-mini",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-20241022",
  };

  const model = opts.model ?? modelMap[providerType] ?? "gemini-2.0-flash";

  const response = await fetch("https://api.replit.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REPLIT_AI_IDENTITY_TOKEN ?? ""}`,
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
    throw new Error(`Replit AI proxy error ${response.status}: ${text}`);
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
    if (providerType === "groq") {
      return await callGroq(messages, opts);
    }
    return await callReplitProxy(providerType, messages, opts);
  } catch (err) {
    logger.warn({ err, providerType }, "Primary provider failed, falling back to Groq");
    if (providerType !== "groq") {
      return await callGroq(messages, opts);
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
