import { db, artifactsTable, eventsTable } from "@workspace/db";
import type { ToolDefinition, ToolHandler, ToolResult, ToolContext } from "./types";
import {
  getOrCreateSandbox,
  runSandboxCommand,
  readSandboxFile,
  writeSandboxFile,
  listSandboxFiles,
} from "./sandbox";
import { broadcastEvent } from "../events-stream";

const definitions = new Map<string, ToolDefinition>();
const handlers = new Map<string, ToolHandler>();

export function registerTool(def: ToolDefinition, handler: ToolHandler): void {
  definitions.set(def.name, def);
  handlers.set(def.name, handler);
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return definitions.get(name);
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(definitions.values());
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const handler = handlers.get(name);
  if (!handler) {
    return { success: false, error: `Tool "${name}" not found` };
  }
  return handler(params, ctx);
}

function logEvent(ctx: ToolContext, eventType: string, description: string) {
  const event = {
    eventType,
    entityType: "task" as const,
    entityId: ctx.taskId,
    description,
  };

  void db
    .insert(eventsTable)
    .values(event)
    .catch(() => {});

  broadcastEvent(event);
}

// ───────────────────────────────────────────────────────────────────────────
// Python tool
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "python",
    description:
      "Execute Python code in the session's persistent sandbox. Use this for data analysis, file manipulation, web scraping, or generating artifacts. You can write files to the workspace and read them later.",
    parameters: [
      {
        name: "code",
        type: "string",
        description: "Python code to execute",
        required: true,
      },
      {
        name: "timeoutSeconds",
        type: "number",
        description: "Maximum execution time in seconds (default 60)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const timeoutMs = (Number(params.timeoutSeconds) || 60) * 1000;

    const result = await runSandboxCommand(
      sandbox.sandboxId,
      `python3 -c ${JSON.stringify(String(params.code))}`,
      timeoutMs
    );

    logEvent(ctx, "tool.python", "Executed Python code in sandbox");

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// Bash tool
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "bash",
    description:
      "Execute a shell command in the session's persistent sandbox. Use this for installing packages, running scripts, or file system operations.",
    parameters: [
      {
        name: "command",
        type: "string",
        description: "Shell command to execute",
        required: true,
      },
      {
        name: "timeoutSeconds",
        type: "number",
        description: "Maximum execution time in seconds (default 60)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const timeoutMs = (Number(params.timeoutSeconds) || 60) * 1000;

    const result = await runSandboxCommand(
      sandbox.sandboxId,
      String(params.command),
      timeoutMs
    );

    logEvent(ctx, "tool.bash", "Executed shell command in sandbox");

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_read
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_read",
    description: "Read a file from the session's sandbox workspace.",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Relative or absolute path to the file",
        required: true,
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const path = String(params.path);
    const content = await readSandboxFile(sandbox.sandboxId, path);
    return { success: true, output: content };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_write
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_write",
    description:
      "Write a file to the session's sandbox workspace. Files persist across tool calls and can be read later by the same session.",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Relative or absolute path for the file",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "File content",
        required: true,
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const path = String(params.path);
    await writeSandboxFile(sandbox.sandboxId, path, String(params.content));

    logEvent(ctx, "tool.file_write", `Wrote file ${path}`);

    return { success: true, output: `File written to ${path}` };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_list
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_list",
    description: "List files in the session's sandbox workspace.",
    parameters: [
      {
        name: "directory",
        type: "string",
        description: "Directory to list (default: /home/user)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const dir = String(params.directory || "/home/user");
    const files = await listSandboxFiles(sandbox.sandboxId, dir);
    return { success: true, output: JSON.stringify(files, null, 2), files };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// api_request
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "api_request",
    description: "Make an HTTP request to an external API or website.",
    parameters: [
      {
        name: "url",
        type: "string",
        description: "URL to request",
        required: true,
      },
      {
        name: "method",
        type: "string",
        description: "HTTP method (GET, POST, PUT, DELETE, PATCH). Default GET.",
      },
      {
        name: "headers",
        type: "object",
        description: "Optional headers object",
      },
      {
        name: "body",
        type: "string",
        description: "Optional request body string",
      },
    ],
  },
  async (params) => {
    const method = String(params.method || "GET").toUpperCase();
    const init: RequestInit = { method };

    if (params.headers && typeof params.headers === "object") {
      init.headers = params.headers as Record<string, string>;
    }

    if (params.body && ["POST", "PUT", "PATCH"].includes(method)) {
      init.body = String(params.body);
    }

    const res = await fetch(String(params.url), init);
    const text = await res.text();

    return {
      success: res.ok,
      output: `Status: ${res.status}\n\n${text.slice(0, 8000)}`,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// artifact_create
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "artifact_create",
    description:
      "Create an artifact record in the platform. Use this to deliver final outputs such as reports, code files, data exports, or documentation.",
    parameters: [
      {
        name: "title",
        type: "string",
        description: "Artifact title",
        required: true,
      },
      {
        name: "artifactType",
        type: "string",
        description: "One of: markdown, code, json, csv, report, zip, text, other",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "Artifact content",
      },
      {
        name: "filePath",
        type: "string",
        description: "Optional file path reference",
      },
    ],
  },
  async (params, ctx) => {
    const content = params.content ? String(params.content) : null;
    const sizeBytes = content ? Buffer.byteLength(content, "utf8") : null;

    const [artifact] = await db
      .insert(artifactsTable)
      .values({
        title: String(params.title),
        artifactType: String(params.artifactType),
        content,
        filePath: params.filePath ? String(params.filePath) : null,
        creatorAgent: ctx.taskId ? `task-${ctx.taskId}` : "agent",
        taskId: ctx.taskId,
        workspaceId: ctx.workspaceId,
        sizeBytes,
      })
      .returning();

    logEvent(ctx, "artifact.created", `Artifact "${artifact.title}" created by agent`);

    return {
      success: true,
      output: `Artifact ${artifact.id} created: ${artifact.title}`,
      artifacts: [
        {
          title: artifact.title,
          artifactType: artifact.artifactType,
          content: artifact.content ?? undefined,
          filePath: artifact.filePath ?? undefined,
        },
      ],
    };
  }
);
