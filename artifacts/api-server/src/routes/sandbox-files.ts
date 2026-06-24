import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { getOrCreateSandbox, readSandboxFile, listSandboxFiles } from "../lib/tools/sandbox";

const router: IRouter = Router();

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
