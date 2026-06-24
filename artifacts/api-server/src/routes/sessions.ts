import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, sessionsTable, messagesTable, eventsTable } from "@workspace/db";
import {
  CreateSessionBody,
  UpdateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  DeleteSessionParams,
  ExportSessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sessions", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.updatedAt));
  res.json(sessions);
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [session] = await db.insert(sessionsTable).values({
    title: parsed.data.title,
    mode: parsed.data.mode ?? "chat",
    providerId: parsed.data.providerId ?? null,
    model: parsed.data.model ?? null,
  }).returning();
  await db.insert(eventsTable).values({
    eventType: "session.created",
    entityType: "session",
    entityId: session.id,
    description: `Session "${session.title}" created`,
  });
  res.status(201).json(session);
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(session);
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [session] = await db.update(sessionsTable).set(parsed.data).where(eq(sessionsTable.id, params.data.id)).returning();
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(session);
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [session] = await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id)).returning();
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.sendStatus(204);
});

router.get("/sessions/:id/export", async (req, res): Promise<void> => {
  const params = ExportSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  const messages = await db.select().from(messagesTable).where(eq(messagesTable.sessionId, params.data.id)).orderBy(messagesTable.createdAt);
  let content = `# ${session.title}\n\n*Mode: ${session.mode} | Exported: ${new Date().toISOString()}*\n\n---\n\n`;
  for (const msg of messages) {
    content += `**${msg.role.toUpperCase()}**\n${msg.content}\n\n`;
  }
  res.json({ sessionId: session.id, title: session.title, content, exportedAt: new Date().toISOString() });
});

export default router;
