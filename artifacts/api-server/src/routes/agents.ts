import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, agentInstancesTable, eventsTable } from "@workspace/db";
import { SpawnAgentBody, GetAgentParams, StopAgentParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentInstancesTable).orderBy(desc(agentInstancesTable.createdAt));
  res.json(agents);
});

router.post("/agents", async (req, res): Promise<void> => {
  const parsed = SpawnAgentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [agent] = await db.insert(agentInstancesTable).values({
    agentType: parsed.data.agentType,
    sessionId: parsed.data.sessionId ?? null,
    model: parsed.data.model ?? null,
    status: "idle",
  }).returning();
  await db.insert(eventsTable).values({
    eventType: "agent.spawned",
    entityType: "agent",
    entityId: agent.id,
    description: `${agent.agentType} agent spawned`,
  });
  res.status(201).json(agent);
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [agent] = await db.select().from(agentInstancesTable).where(eq(agentInstancesTable.id, params.data.id));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json(agent);
});

router.post("/agents/:id/stop", async (req, res): Promise<void> => {
  const params = StopAgentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [agent] = await db.update(agentInstancesTable)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(eq(agentInstancesTable.id, params.data.id))
    .returning();
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  await db.insert(eventsTable).values({
    eventType: "agent.stopped",
    entityType: "agent",
    entityId: agent.id,
    description: `${agent.agentType} agent stopped`,
  });
  res.json(agent);
});

export default router;
