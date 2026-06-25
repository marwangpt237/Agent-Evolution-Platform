import { Router, type IRouter } from "express";
import express from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { getOrCreateSandbox, readSandboxFile, listSandboxFiles, runSandboxCommand } from "../lib/tools/sandbox";

const router: IRouter = Router();

router.get("/sessions/:sessionId/sandbox/export", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    await runSandboxCommand(sandbox.sandboxId, 'cd /home/user && zip -r /tmp/workspace.zip .', 30000);
    const b64 = await runSandboxCommand(sandbox.sandboxId, 'base64 -w 0 /tmp/workspace.zip', 30000);
    const buffer = Buffer.from(b64.stdout, 'base64');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="workspace.zip"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sessions/:sessionId/sandbox/upload", express.json({limit: '50mb'}), async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const { filename, base64 } = req.body;
    const cmd = `echo "${base64}" | base64 -d > "/home/user/${filename}"`;
    await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/sessions/:sessionId/sandbox/files", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  if (!sessionId) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  try {
    const sandbox = await getOrCreateSandbox(sessionId);
    const files = await listSandboxFiles(sandbox.sandboxId);
    res.json({ sandboxId: sandbox.sandboxId, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Catch-all for nested file paths. Express 5 path-to-regexp does not support
// wildcard suffixes in route strings, so we use a RegExp route.
router.get(
  /^\/sessions\/(\d+)\/sandbox\/files\/(.*)$/,
  async (req, res): Promise<void> => {
    const sessionId = Number(req.params[0]);
    if (!sessionId) { res.status(400).json({ error: "Invalid session id" }); return; }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const filePath = String(req.params[1] ?? "");
    if (!filePath) { res.status(400).json({ error: "Missing file path" }); return; }

    try {
      const sandbox = await getOrCreateSandbox(sessionId);
      const content = await readSandboxFile(sandbox.sandboxId, `/${filePath}`);
      res.json({ path: filePath, content });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

export default router;
