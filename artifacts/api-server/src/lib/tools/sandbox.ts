import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { Sandbox } from "@e2b/code-interpreter";

const E2B_API_KEY = process.env.E2B_API_KEY;
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID || "base";
const DEFAULT_TIMEOUT_SECONDS = 300;

export interface SandboxInfo {
  sandboxId: string;
  createdAt: Date;
}


const activeSandboxes = new Map<number, Sandbox>();

export async function getOrCreateSandbox(sessionId: number) {
  if (!E2B_API_KEY) throw new Error("E2B_API_KEY not configured");

  const cached = activeSandboxes.get(sessionId);
  if (cached) return { sandboxId: cached.sandboxId, createdAt: new Date() };

  logger.info({ sessionId }, "Creating new E2B sandbox via SDK");
  const sbx = await Sandbox.create({ apiKey: E2B_API_KEY });
  
  // Save mapping
  activeSandboxes.set(sessionId, sbx);
  
  // Persist to DB
  await db.update(sessionsTable)
    .set({ sandboxId: sbx.sandboxId })
    .where(eq(sessionsTable.id, sessionId));

  return { sandboxId: sbx.sandboxId, createdAt: new Date() };
}

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  timeoutMs = 60_000
) {
  let sbx: Sandbox | undefined;
  for (const s of activeSandboxes.values()) {
    if (s.sandboxId === sandboxId) { sbx = s; break; }
  }

  if (!sbx) {
    logger.info({ sandboxId }, "Reconnecting to E2B sandbox");
    sbx = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
    // Find session to cache it
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.sandboxId, sandboxId));
    if (session) activeSandboxes.set(session.id, sbx);
  }

  const result = await sbx.commands.run(command, { timeoutMs });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}

export async function readSandboxFile(sandboxId: string, filePath: string): Promise<string> {
  let sbx: Sandbox | undefined;
  for (const s of activeSandboxes.values()) {
    if (s.sandboxId === sandboxId) { sbx = s; break; }
  }
  if (!sbx) sbx = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
  
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(filePath);
  if (isImage) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const buf = await sbx.files.read(filePath);
    const b64 = Buffer.from(buf).toString('base64');
    return `data:image/${mime};base64,${b64}`;
  }
  
  const content = await sbx.files.read(filePath);
  return Buffer.from(content).toString('utf8');
}

export async function writeSandboxFile(sandboxId: string, filePath: string, content: string): Promise<void> {
  let sbx: Sandbox | undefined;
  for (const s of activeSandboxes.values()) {
    if (s.sandboxId === sandboxId) { sbx = s; break; }
  }
  if (!sbx) sbx = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
  
  await sbx.files.write(filePath, content);
}

export async function listSandboxFiles(
  sandboxId: string,
  dir = "/home/user"
) {
  const result = await runSandboxCommand(
    sandboxId,
    `find '${dir}' -type f -printf '%s %p\n' 2>/dev/null || find '${dir}' -type f -exec stat -c '%s %n' {} \;`,
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
  const sbx = activeSandboxes.get(sessionId);
  if (sbx) {
    await sbx.kill();
    activeSandboxes.delete(sessionId);
    await db.update(sessionsTable).set({ sandboxId: null }).where(eq(sessionsTable.id, sessionId));
  }
}

