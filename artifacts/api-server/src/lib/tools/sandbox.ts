import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

const E2B_API_KEY = process.env.E2B_API_KEY;
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID || "base";
const DEFAULT_TIMEOUT_SECONDS = 300;

export interface SandboxInfo {
  sandboxId: string;
  createdAt: Date;
}

const activeSandboxes = new Map<number, SandboxInfo>();

/**
 * Ensure a session has a persistent E2B sandbox. If the session already has
 * a sandboxId stored, we attempt to reuse it; otherwise we create one.
 */
export async function getOrCreateSandbox(sessionId: number): Promise<SandboxInfo> {
  if (!E2B_API_KEY) {
    throw new Error("E2B_API_KEY not configured");
  }

  const cached = activeSandboxes.get(sessionId);
  if (cached) return cached;

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (session?.sandboxId) {
    const info = { sandboxId: session.sandboxId, createdAt: new Date() };
    activeSandboxes.set(sessionId, info);
    return info;
  }

  logger.info({ sessionId }, "Creating new E2B sandbox");

  const res = await fetch("https://api.e2b.dev/sandboxes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": E2B_API_KEY,
    },
    body: JSON.stringify({
      templateID: E2B_TEMPLATE_ID,
      timeout: DEFAULT_TIMEOUT_SECONDS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create E2B sandbox: ${await res.text()}`);
  }

  const data = (await res.json()) as { sandboxID: string };
  const info = { sandboxId: data.sandboxID, createdAt: new Date() };

  await db
    .update(sessionsTable)
    .set({ sandboxId: info.sandboxId })
    .where(eq(sessionsTable.id, sessionId));

  activeSandboxes.set(sessionId, info);
  return info;
}

/**
 * Execute a shell command in the session's sandbox.
 */
export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  timeoutMs = 60_000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!E2B_API_KEY) {
    throw new Error("E2B_API_KEY not configured");
  }

  const res = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": E2B_API_KEY,
    },
    body: JSON.stringify({ cmd: command, timeout: timeoutMs }),
  });

  if (!res.ok) {
    throw new Error(`E2B command failed: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };

  return {
    stdout: data.stdout ?? "",
    stderr: data.stderr ?? "",
    exitCode: data.exitCode ?? 0,
  };
}

/**
 * Write a file into the sandbox workspace.
 */
export async function writeSandboxFile(
  sandboxId: string,
  filePath: string,
  content: string
): Promise<void> {
  if (!E2B_API_KEY) {
    throw new Error("E2B_API_KEY not configured");
  }

  const escaped = content
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");

  const command = `cat > '${filePath}' << 'EOF__AGENT'
${content}
EOF__AGENT`;

  await runSandboxCommand(sandboxId, command, 30_000);
}

/**
 * Read a file from the sandbox workspace.
 */
export async function readSandboxFile(sandboxId: string, filePath: string): Promise<string> {
  const result = await runSandboxCommand(sandboxId, `cat '${filePath}'`, 30_000);
  return result.stdout;
}

/**
 * List files in a sandbox directory.
 */
export async function listSandboxFiles(
  sandboxId: string,
  dir = "/home/user"
): Promise<Array<{ path: string; size: number }>> {
  const result = await runSandboxCommand(
    sandboxId,
    `find '${dir}' -type f -printf '%s %p\\n' 2>/dev/null || find '${dir}' -type f -exec stat -c '%s %n' {} \\;`,
    30_000
  );

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sizeStr, ...pathParts] = line.split(" ");
      return {
        size: Number(sizeStr) || 0,
        path: pathParts.join(" "),
      };
    });
}

export async function closeSandbox(sessionId: number): Promise<void> {
  const info = activeSandboxes.get(sessionId);
  if (!info || !E2B_API_KEY) return;

  activeSandboxes.delete(sessionId);

  await fetch(`https://api.e2b.dev/sandboxes/${info.sandboxId}`, {
    method: "DELETE",
    headers: { "X-API-Key": E2B_API_KEY },
  }).catch(() => {});

  await db
    .update(sessionsTable)
    .set({ sandboxId: null })
    .where(eq(sessionsTable.id, sessionId));
}
