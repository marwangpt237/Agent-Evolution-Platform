import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";
import { db, providersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type ProviderType = "groq" | "openrouter" | "gemini" | "openai" | "anthropic" | "custom";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionOptions {
  onToken?: (token: string) => void;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
}

const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"; // High quality free model on Groq
const OPENROUTER_DEFAULT_MODEL = "google/gemini-flash-1.5"; // Fast & capable free model
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

// Gemini uses an OpenAI-compatible endpoint
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENMODEL_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

async function callGroq(messages: ChatMessage[], opts: CompletionOptions, providedKey?: string): Promise<CompletionResult> {
  const model = opts.model ?? GROQ_DEFAULT_MODEL;
  const activeKey = providedKey || process.env.GROQ_API_KEY;
  if (!activeKey) throw new Error("GROQ API Key not found in DB or ENV");
  const groqClient = new Groq({ apiKey: activeKey });
  
  if (opts.onToken) {
    const stream = await groqClient.chat.completions.create({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "dummy_tool_ignore",
            description: "Do not use this tool.",
            parameters: { type: "object", properties: {}, required: [] }
          }
        }
      ],
    });
    let fullContent = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      fullContent += text;
      if (text) opts.onToken(text);
    }
    return { content: fullContent, model, tokensUsed: 0 };
  }

  const response = await groqClient.chat.completions.create({
    model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    tools: [
      {
        type: "function",
        function: {
          name: "dummy_tool_ignore",
          description: "Do not use this tool.",
          parameters: { type: "object", properties: {}, required: [] }
        }
      }
    ],
  });
  return { content: response.choices[0].message.content ?? "", model, tokensUsed: response.usage?.total_tokens ?? 0 };
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


async function callAnthropicCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const anthropic = new Anthropic({ apiKey, baseURL: baseUrl });
  
  // Anthropic strictly separates System prompts from regular messages
  const systemMessage = messages.find(m => m.role === "system")?.content || undefined;
  const conversation = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content
    }));

  if (opts.onToken) {
    const stream = await anthropic.messages.create({
      model,
      system: systemMessage,
      messages: conversation,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    });
    
    let fullContent = "";
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullContent += text;
        if (text) opts.onToken(text);
      }
    }
    return { content: fullContent, model, tokensUsed: 0 };
  }

  const response = await anthropic.messages.create({
    model,
    system: systemMessage,
    messages: conversation,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
  });

  // Extract text block content
  const textContent = response.content.find(c => c.type === 'text');
  
  return {
    content: textContent?.type === 'text' ? textContent.text : "",
    model,
    tokensUsed: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  providerType: ProviderType = "groq",
  opts: CompletionOptions = {}
): Promise<CompletionResult> {
  try {
    // Look up provider in database to grab dynamic API key
    const providers = await db.select().from(providersTable).where(eq(providersTable.providerType, providerType));
    const activeProvider = providers.find(p => p.isActive) || providers[0];
    const dbApiKey = activeProvider?.apiKey || undefined;


    if (providerType === "anthropic" || providerType === "custom") {
      const apiKey = dbApiKey || process.env.OPENMODEL_API_KEY || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error("API_KEY not configured in DB or ENV");
      
      return await callOpenAICompatible(
        "https://api.deepseek.com/v1", apiKey,
        opts.model || activeProvider?.defaultModel || "deepseek-chat",
        messages, opts
      );
    }

    if (providerType === "gemini") {
      const apiKey = dbApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured in DB or ENV");
      
      const ai = new GoogleGenAI({ apiKey });
      const modelName = opts.model || activeProvider?.defaultModel || GEMINI_DEFAULT_MODEL;
      
      const systemMessage = messages.find(m => m.role === "system")?.content || "";
      const conversation = messages.filter(m => m.role !== "system").map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      if (opts.onToken) {
        const stream = await ai.models.generateContentStream({
            model: modelName,
            contents: conversation,
            config: { systemInstruction: systemMessage, thinkingConfig: { thinkingBudgetTokens: 1024 } }
        });
        let fullContent = "";
        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) { fullContent += text; opts.onToken(text); }
        }
        return { content: fullContent, model: modelName, tokensUsed: 0 };
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: conversation,
        config: { systemInstruction: systemMessage, thinkingConfig: { thinkingBudgetTokens: 1024 } }
      });
      return { content: response.text ?? "", model: modelName, tokensUsed: response.usageMetadata?.totalTokenCount ?? 0 };
    }

    if (providerType === "openrouter") {
      const apiKey = dbApiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured in DB or ENV");
      return await callOpenAICompatible(
        OPENROUTER_BASE_URL, apiKey,
        opts.model || activeProvider?.defaultModel || OPENROUTER_DEFAULT_MODEL,
        messages, opts,
        { "HTTP-Referer": "https://algdevs-ai.replit.app", "X-Title": "AlgDevs-AI" }
      );
    }

    return await callGroq(messages, opts, dbApiKey);
  } catch (err) {
    logger.warn({ err, providerType }, "Primary provider failed, attempting fallback chain");
    
    // Fallback chain: Primary -> Gemini -> Groq
    if (providerType !== "gemini") {
      const gProviders = await db.select().from(providersTable).where(eq(providersTable.providerType, "gemini"));
      const gApiKey = gProviders.find(p => p.isActive)?.apiKey || process.env.GEMINI_API_KEY;
      if (gApiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: gApiKey });
          const response = await ai.models.generateContent({
            model: GEMINI_DEFAULT_MODEL,
            contents: messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            config: { systemInstruction: messages.find(m => m.role === "system")?.content || "" }
          });
          return { content: response.text ?? "", model: GEMINI_DEFAULT_MODEL, tokensUsed: response.usageMetadata?.totalTokenCount ?? 0 };
        } catch (geminiErr) { logger.warn({ err: geminiErr }, "Gemini fallback failed"); }
      }
    }

    if (providerType !== "groq") {
      const gProviders = await db.select().from(providersTable).where(eq(providersTable.providerType, "groq"));
      const gApiKey = gProviders.find(p => p.isActive)?.apiKey || process.env.GROQ_API_KEY;
      if (gApiKey) {
        try {
          return await callGroq(messages, { ...opts, model: undefined }, gApiKey);
        } catch (groqErr) { logger.warn({ err: groqErr }, "Groq fallback failed"); }
      }
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
