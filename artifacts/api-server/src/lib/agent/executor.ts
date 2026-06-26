import { db, planStepsTable, tasksTable, plansTable, memoriesTable, sessionsTable, providersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AgentContext, StepExecutionResult } from "./types";
import { chatCompletion, type ChatMessage } from "../ai";
import { getAllToolDefinitions, executeTool } from "../tools/registry";
import type { ToolContext, ToolCall, ToolResult } from "../tools/types";
import { logger } from "../logger";
import { getOrCreateSandbox } from "../tools/sandbox";
import { broadcastEvent } from "../events-stream";

const MAX_TOOL_ITERATIONS = 10;

function buildToolPrompt(ctx: AgentContext): string {
  const tools = getAllToolDefinitions();

  const toolDescriptions = tools
    .map((tool) => {
      const params = tool.parameters
        .map((p) => {
          const required = p.required ? "required" : "optional";
          return `    - ${p.name} (${p.type}, ${required}): ${p.description}`;
        })
        .join("\n");
      return `- ${tool.name}: ${tool.description}\n${params}`;
    })
    .join("\n\n");

  return `You are a helpful agentic assistant. You are a clone of Arena.ai's Agent Mode.
You have access to a sandboxed workspace where you can read, create, manage, and run files. Use the workspace to write code, notes, or any text content the user requests as a file.

Task: ${ctx.taskTitle}
${ctx.taskDescription ? `Description: ${ctx.taskDescription}` : ""}

You have access to the following tools:

${toolDescriptions}

To use a tool, respond with a JSON code block like this:

\`\`\`json
{"tool": "python", "parameters": {"code": "print('hello')"}}
\`\`\`

After each tool result, decide if you need another tool or if you are done. When you are done, respond with a final message summarizing what you accomplished and any files or artifacts created. Keep your reasoning concise and focused on the task.`;
}

function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  
  // Try extracting directly embedded JSON objects using a loose brace matcher
  const jsonRegex = /\{\s*"tool"\s*:.*\}/g;
  const matches = content.match(jsonRegex);
  
  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match) as ToolCall;
        if (parsed.tool && parsed.parameters) {
          calls.push(parsed);
        }
      } catch (e) {}
    }
  }

  // If we STILL couldn't extract the tools, let's try a greedy JSON parse across the whole content block
  if (calls.length === 0) {
    const fallbackRegex = /\{[\s\S]*?\}/g;
    let fm;
    while ((fm = fallbackRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(fm[0]) as ToolCall;
        if (parsed.tool && parsed.parameters) calls.push(parsed);
      } catch {}
    }
  }

  // Fallback to strict markdown block parsing if regex missed
  if (calls.length === 0) {
    const blockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as ToolCall;
        if (parsed.tool && parsed.parameters) calls.push(parsed);
      } catch {}
    }
  }

  // Absolute fallback: try parsing the whole thing if it's just raw JSON
  if (calls.length === 0) {
    try {
       const parsed = JSON.parse(content) as ToolCall;
       if (parsed.tool && parsed.parameters) calls.push(parsed);
    } catch {}
  }

  return calls;
}

function stripToolBlocks(content: string): string {
  return content
    .replace(/```json\s*[\s\S]*?\s*```/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

export async function executeAgentTask(ctx: AgentContext): Promise<StepExecutionResult> {
  logger.info({ taskId: ctx.taskId, agentType: ctx.agentType }, "Executing agent task");

  await broadcastEvent({ // @ts-expect-error type override
 // @ts-expect-error type override

    eventType: "task.running",
    entityType: "task",
    entityId: ctx.taskId,
    description: `${ctx.agentType} agent started task "${ctx.taskTitle}"`,
  });

  // Ensure sandbox exists so the session has a persistent workspace
  await getOrCreateSandbox(ctx.sessionId).catch(() => null);

  const toolContext: ToolContext = {
    sessionId: ctx.sessionId,
    sandboxId: null,
    taskId: ctx.taskId,
    planId: ctx.planId,
    workspaceId: ctx.workspaceId,
  };

  const sandbox = await getOrCreateSandbox(ctx.sessionId).catch(() => null);
  if (sandbox) {
    toolContext.sandboxId = sandbox.sandboxId;
  }

  let messages: ChatMessage[] = [
    { role: "system", content: buildToolPrompt(ctx) },
    { role: "user", content: "Execute the task. Use tools as needed." },
  ];

  const toolCallsLog: StepExecutionResult["toolCalls"] = [];
  let finalOutput = "";
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

        // Context Compaction (Only compact for Groq, leave large contexts alone for DeepSeek & Gemini)
    if (messages.length > 15 && providerType === "groq") {
      const keepFront = messages.slice(0, 2);
      const keepBack = messages.slice(messages.length - 8);
      const summarized = [{ 
        role: "user" as const, 
        content: "[SYSTEM NOTE: Older messages have been compacted to save memory. Continue with your task.]" 
      }];
      messages = [...keepFront, ...summarized, ...keepBack];
    }

    // CHECK FOR CANCELLATION
    const [currentTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, ctx.taskId));
    if (currentTask?.status === "cancelled") {
       finalOutput = "Task cancelled by user.";
       break;
    }

            // Fetch session provider
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, ctx.sessionId));
    let providerType = "groq" as any;
    if (session?.providerId) {
      const [prov] = await db.select().from(providersTable).where(eq(providersTable.id, session.providerId));
      if (prov) providerType = prov.providerType;
    }

    const response = await chatCompletion(messages, providerType, { 
      maxTokens: 2048,
      onToken: (token) => {
        broadcastEvent({ // @ts-expect-error type override

          eventType: "agent.thought.chunk",
          entityType: "task",
          entityId: ctx.taskId,
          description: token,
        });
      }
    });
    const content = response.content;

    await broadcastEvent({ // @ts-expect-error type override
 // @ts-expect-error type override

      eventType: "agent.reasoning",
      entityType: "task",
      entityId: ctx.taskId,
      description: content.slice(0, 200),
      metadata: JSON.stringify({ model: response.model, tokensUsed: response.tokensUsed }),
    });

    const calls = parseToolCalls(content);

    if (calls.length === 0) {
      finalOutput = stripToolBlocks(content);
      break;
    }

    for (const call of calls) {
      const result = await executeTool(call.tool, call.parameters, toolContext);
      toolCallsLog.push({
        tool: call.tool,
        parameters: call.parameters,
        result,
      });

      const resultText = result.success
        ? `Result of ${call.tool}:\n${result.output ?? ""}`
        : `Error from ${call.tool}: ${result.error ?? "unknown error"}`;

      messages.push({ role: "assistant", content: JSON.stringify(call) });
      messages.push({ role: "user", content: resultText });

      await broadcastEvent({ // @ts-expect-error type override
 // @ts-expect-error type override

        eventType: "tool.result",
        entityType: "task",
        entityId: ctx.taskId,
        description: `Tool ${call.tool} ${result.success ? "succeeded" : "failed"}`,
        metadata: JSON.stringify({ tool: call.tool, parameters: call.parameters, result }),
      });
    }
  }

  if (iterations >= MAX_TOOL_ITERATIONS && !finalOutput) {
    finalOutput = "Reached maximum number of tool iterations. Returning partial results.";
  }

  const [finalTaskCheck] = await db.select().from(tasksTable).where(eq(tasksTable.id, ctx.taskId));
  if (finalOutput && iterations > 0 && finalTaskCheck?.status !== "cancelled") {
    try {
      const reflectMsg = [...messages, { role: "user" as const, content: "Review your work. Did you fully complete the user's request? Provide a brief summary of the final state." }];
          // Fetch session provider for reflection
    const [refSession] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, ctx.sessionId));
    let refProviderType = "groq" as any;
    if (refSession?.providerId) {
      const [prov] = await db.select().from(providersTable).where(eq(providersTable.id, refSession.providerId));
      if (prov) refProviderType = prov.providerType;
    }
    const reflection = await chatCompletion(reflectMsg, refProviderType, { maxTokens: 300 });
      finalOutput += "\n\n**Agent Reflection:**\n" + reflection.content;
    } catch(e) {}
  }

  // Update task with output
  await db
    .update(tasksTable)
    .set({
      status: "completed",
      output: finalOutput,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, ctx.taskId));

  await broadcastEvent({ // @ts-expect-error type override
 // @ts-expect-error type override

    eventType: "task.completed",
    entityType: "task",
    entityId: ctx.taskId,
    description: `${ctx.agentType} agent completed task "${ctx.taskTitle}"`,
  });

  const artifactsCreated = toolCallsLog.reduce(
    (sum, call) => sum + (call.result.artifacts?.length ?? 0),
    0
  );

  return {
    success: true,
    output: finalOutput,
    toolCalls: toolCallsLog,
    artifactsCreated,
  };
}

/**
 * Execute a single plan step using the right agent type.
 */
export async function executePlanStep(
  stepId: number,
  planId: number,
  sessionId: number
): Promise<StepExecutionResult> {
  const [step] = await db.select().from(planStepsTable).where(eq(planStepsTable.id, stepId));
  if (!step) throw new Error("Step not found");

  const agentType = step.agentType || "supervisor";

  // Create a task for this step. Max retries = 0 because the plan orchestrator
  // handles step-level retries, not the background task queue.
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: step.title,
      description: step.description,
      agentType,
      status: "running",
      maxRetries: 0,
      planId,
      sessionId,
    })
    .returning();

  await db
    .update(planStepsTable)
    .set({ status: "running" })
    .where(eq(planStepsTable.id, stepId));

  try {
    const result = await executeAgentTask({
      taskId: task.id,
      planId,
      sessionId,
      workspaceId: null,
      agentType,
      taskTitle: step.title,
      taskDescription: step.description,
    });

    await db
      .update(planStepsTable)
      .set({ status: "completed", output: result.output, updatedAt: new Date() })
      .where(eq(planStepsTable.id, stepId));

    // Recalculate completed steps
    const allSteps = await db.select().from(planStepsTable).where(eq(planStepsTable.planId, planId));
    const completed = allSteps.filter((s) => s.status === "completed").length;
    await db
      .update(plansTable)
      .set({ completedSteps: completed })
      .where(eq(plansTable.id, planId));

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .update(planStepsTable)
      .set({ status: "failed", output: errorMessage, updatedAt: new Date() })
      .where(eq(planStepsTable.id, stepId));

    await db
      .update(tasksTable)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(eq(tasksTable.id, task.id));

    throw err;
  }
}
