import { chatCompletion, type ChatMessage } from "../ai";
import type { PlanSpec } from "./types";

const PLANNING_PROMPT = `You are a Planner Agent. Given a user brief, decompose it into a concrete plan of steps that an autonomous agent platform can execute.

Each step must specify:
- title: short action name
- description: what the step should accomplish
- agentType: one of [supervisor, planner, researcher, coder, reviewer]
  - supervisor: orchestrates and validates
  - planner: re-planning or analysis
  - researcher: gathers information from the web or files
  - coder: writes and executes code in the sandbox
  - reviewer: validates outputs and quality
- order: 0-based position
- dependsOn: array of step indices this step depends on (optional)

Respond ONLY with a JSON code block containing the plan. Example:

\`\`\`json
{
  "title": "Research and report on X",
  "description": "Gather information and produce a markdown report",
  "steps": [
    { "title": "Search web sources", "description": "Find 3-5 reliable sources", "agentType": "researcher", "order": 0 },
    { "title": "Analyze and synthesize", "description": "Combine findings into a structured outline", "agentType": "planner", "order": 1, "dependsOn": [0] },
    { "title": "Write report", "description": "Create markdown report in the sandbox", "agentType": "coder", "order": 2, "dependsOn": [1] },
    { "title": "Review report", "description": "Check quality and completeness", "agentType": "reviewer", "order": 3, "dependsOn": [2] }
  ]
}
\`\`\``;

export async function createPlanFromBrief(brief: string): Promise<PlanSpec> {
  const messages: ChatMessage[] = [
    { role: "system", content: PLANNING_PROMPT },
    { role: "user", content: brief },
  ];

  const response = await chatCompletion(messages, "groq", { maxTokens: 2048 });
  const content = response.content;

  const match = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error("Planner did not return a valid JSON plan");
  }

  const parsed = JSON.parse(match[1]) as PlanSpec;

  if (!parsed.title || !Array.isArray(parsed.steps)) {
    throw new Error("Invalid plan structure from planner");
  }

  return parsed;
}

export async function replanAfterFailure(
  brief: string,
  currentPlan: PlanSpec,
  failedStepIndex: number,
  failureReason: string
): Promise<PlanSpec> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${PLANNING_PROMPT}\n\nA previous step failed. Produce a revised plan that recovers from the failure.`,
    },
    {
      role: "user",
      content: `Brief: ${brief}\n\nCurrent plan: ${JSON.stringify(currentPlan)}\n\nFailed step index: ${failedStepIndex}\nFailure reason: ${failureReason}\n\nPlease provide a revised plan.`,
    },
  ];

  const response = await chatCompletion(messages, "groq", { maxTokens: 2048 });
  const content = response.content;

  const match = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error("Planner did not return a valid JSON plan during replanning");
  }

  return JSON.parse(match[1]) as PlanSpec;
}
