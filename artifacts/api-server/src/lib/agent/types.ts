import type { ToolResult } from "../tools/types";

export interface AgentContext {
  taskId: number;
  planId: number | null;
  sessionId: number;
  workspaceId: number | null;
  agentType: string;
  taskTitle: string;
  taskDescription: string | null;
}

export interface StepExecutionResult {
  success: boolean;
  output: string;
  toolCalls: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    result: ToolResult;
  }>;
  artifactsCreated: number;
}

export interface PlanStepSpec {
  title: string;
  description?: string;
  agentType?: string;
  order?: number;
  dependsOn?: number[];
}

export interface PlanSpec {
  title: string;
  description?: string;
  steps: PlanStepSpec[];
}
