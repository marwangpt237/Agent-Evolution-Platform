import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, sessionsTable, messagesTable, providersTable, eventsTable } from "@workspace/db";
import { ListMessagesParams, SendMessageParams, SendMessageBody } from "@workspace/api-zod";
import { chatCompletion, type ProviderType, type ChatMessage } from "../lib/ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/sessions/:sessionId/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.sessionId, params.data.sessionId))
    .orderBy(asc(messagesTable.createdAt));
  res.json(messages);
});

router.post("/sessions/:sessionId/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.sessionId));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Store user message
  const [userMsg] = await db.insert(messagesTable).values({
    sessionId: session.id,
    role: "user",
    content: parsed.data.content,
  }).returning();

  // Fetch history for context
  const history = await db.select().from(messagesTable)
    .where(eq(messagesTable.sessionId, session.id))
    .orderBy(asc(messagesTable.createdAt));

  const chatHistory: ChatMessage[] = history.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  // Determine provider
  let providerType: ProviderType = "groq";
  if (parsed.data.providerId) {
    const [prov] = await db.select().from(providersTable).where(eq(providersTable.id, parsed.data.providerId));
    if (prov) providerType = prov.providerType as ProviderType;
  } else if (session.providerId) {
    const [prov] = await db.select().from(providersTable).where(eq(providersTable.id, session.providerId));
    if (prov) providerType = prov.providerType as ProviderType;
  }

  const model = parsed.data.model ?? session.model ?? undefined;

  try {
    const result = await chatCompletion(chatHistory, providerType, { model });

    const [assistantMsg] = await db.insert(messagesTable).values({
      sessionId: session.id,
      role: "assistant",
      content: result.content,
      model: result.model,
      tokensUsed: result.tokensUsed,
    }).returning();

    // Update message count
    await db.update(sessionsTable)
      .set({ messageCount: session.messageCount + 2 })
      .where(eq(sessionsTable.id, session.id));

    await db.insert(eventsTable).values({
      eventType: "message.sent",
      entityType: "message",
      entityId: assistantMsg.id,
      description: `AI responded in session "${session.title}"`,
    });

    res.status(201).json(assistantMsg);
  } catch (err) {
    logger.error({ err }, "AI completion failed");
    // Store user message was already saved, return error
    res.status(500).json({ error: "AI provider unavailable. Please try a different provider." });
  }
});

export default router;
