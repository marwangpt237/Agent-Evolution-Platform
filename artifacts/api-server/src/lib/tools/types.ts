/**
 * Tool system types for CodeAct-style agent execution.
 *
 * Tools are functions that the agent can call by emitting a structured call.
 * Each tool receives a sandbox context (session-scoped) and returns a result
 * that can be fed back to the LLM.
 */

export interface ToolContext {
  sessionId: number;
  sandboxId: string | null;
  taskId: number | null;
  planId: number | null;
  workspaceId: number | null;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  items?: ToolParameter;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Array<{
    title: string;
    artifactType: string;
    content?: string;
    filePath?: string;
  }>;
  files?: Array<{
    path: string;
    size: number;
  }>;
}

export type ToolHandler = (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
