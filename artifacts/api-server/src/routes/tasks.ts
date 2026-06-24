import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, tasksTable, eventsTable } from "@workspace/db";
import {
  ListTasksQueryParams, CreateTaskBody, GetTaskParams,
  CancelTaskParams, RetryTaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const query = ListTasksQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  let tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
  if (query.data.status) tasks = tasks.filter(t => t.status === query.data.status);
  if (query.data.agentType) tasks = tasks.filter(t => t.agentType === query.data.agentType);
  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [task] = await db.insert(tasksTable).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    agentType: parsed.data.agentType,
    priority: parsed.data.priority ?? 0,
    maxRetries: parsed.data.maxRetries ?? 3,
    sessionId: parsed.data.sessionId ?? null,
    planId: parsed.data.planId ?? null,
    workspaceId: parsed.data.workspaceId ?? null,
  }).returning();
  await db.insert(eventsTable).values({
    eventType: "task.created",
    entityType: "task",
    entityId: task.id,
    description: `Task "${task.title}" created for ${task.agentType} agent`,
  });
  res.status(201).json(task);
});

router.get("/tasks/stats", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable);
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    queued: tasks.filter(t => t.status === "queued").length,
    running: tasks.filter(t => t.status === "running").length,
    paused: tasks.filter(t => t.status === "paused").length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed: tasks.filter(t => t.status === "failed").length,
    cancelled: tasks.filter(t => t.status === "cancelled").length,
  };
  res.json(stats);
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.post("/tasks/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.update(tasksTable)
    .set({ status: "cancelled" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  await db.insert(eventsTable).values({
    eventType: "task.cancelled",
    entityType: "task",
    entityId: task.id,
    description: `Task "${task.title}" cancelled`,
  });
  res.json(task);
});

router.post("/tasks/:id/retry", async (req, res): Promise<void> => {
  const params = RetryTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const [task] = await db.update(tasksTable)
    .set({ status: "pending", retryCount: existing.retryCount + 1, errorMessage: null })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  await db.insert(eventsTable).values({
    eventType: "task.retried",
    entityType: "task",
    entityId: task.id,
    description: `Task "${task.title}" queued for retry (attempt ${task.retryCount})`,
  });
  res.json(task);
});

export default router;
