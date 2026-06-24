import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, sandboxExecutionsTable, eventsTable } from "@workspace/db";
import { ExecuteSandboxBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function runE2BSandbox(
  code: string,
  language: string,
  timeoutSeconds: number
): Promise<{ stdout: string; stderr: string; exitCode: number; executionMs: number }> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY not configured");

  const start = Date.now();

  // Create sandbox
  const createRes = await fetch("https://api.e2b.dev/sandboxes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ templateID: "base", timeout: timeoutSeconds }),
  });

  if (!createRes.ok) {
    throw new Error(`E2B create sandbox failed: ${await createRes.text()}`);
  }
  const sandbox = (await createRes.json()) as { sandboxID: string };
  const sandboxId = sandbox.sandboxID;

  try {
    const cmdMap: Record<string, string> = {
      python: `python3 -c ${JSON.stringify(code)}`,
      javascript: `node -e ${JSON.stringify(code)}`,
      typescript: `npx ts-node -e ${JSON.stringify(code)}`,
      bash: code,
      ruby: `ruby -e ${JSON.stringify(code)}`,
    };
    const cmd = cmdMap[language] ?? `echo "Unsupported language: ${language}"`;

    const execRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ cmd, timeout: timeoutSeconds * 1000 }),
    });

    if (!execRes.ok) {
      throw new Error(`E2B exec failed: ${await execRes.text()}`);
    }

    const execData = (await execRes.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };

    return {
      stdout: execData.stdout ?? "",
      stderr: execData.stderr ?? "",
      exitCode: execData.exitCode ?? 0,
      executionMs: Date.now() - start,
    };
  } finally {
    fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    }).catch(() => {});
  }
}

router.post("/sandbox/execute", async (req, res): Promise<void> => {
  const parsed = ExecuteSandboxBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { code, language, taskId, timeoutSeconds = 30 } = parsed.data;

  const [execution] = await db.insert(sandboxExecutionsTable).values({
    language,
    code,
    status: "running",
    taskId: taskId ?? null,
  }).returning();

  try {
    const result = await runE2BSandbox(code, language, timeoutSeconds);

    const [updated] = await db.update(sandboxExecutionsTable)
      .set({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        status: result.exitCode === 0 ? "completed" : "failed",
        executionMs: result.executionMs,
      })
      .where(eq(sandboxExecutionsTable.id, execution.id))
      .returning();

    await db.insert(eventsTable).values({
      eventType: "sandbox.executed",
      entityType: "sandbox",
      entityId: updated.id,
      description: `${language} code executed in sandbox (${result.executionMs}ms)`,
    });

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Sandbox execution failed");
    const [updated] = await db.update(sandboxExecutionsTable)
      .set({ status: "failed", stderr: err instanceof Error ? err.message : String(err) })
      .where(eq(sandboxExecutionsTable.id, execution.id))
      .returning();
    res.json(updated);
  }
});

router.get("/sandbox/executions", async (_req, res): Promise<void> => {
  const executions = await db.select().from(sandboxExecutionsTable)
    .orderBy(desc(sandboxExecutionsTable.createdAt))
    .limit(50);
  res.json(executions);
});

export default router;
