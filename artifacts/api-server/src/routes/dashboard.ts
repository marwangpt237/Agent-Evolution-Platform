import { Router, type IRouter } from "express";
import { desc, gte } from "drizzle-orm";
import { db, sessionsTable, plansTable, tasksTable, artifactsTable, workspacesTable, providersTable, eventsTable, sandboxExecutionsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [sessions, plans, tasks, artifacts, workspaces, providers, recentEvents, sandboxToday] = await Promise.all([
    db.select().from(sessionsTable),
    db.select().from(plansTable),
    db.select().from(tasksTable),
    db.select().from(artifactsTable),
    db.select().from(workspacesTable),
    db.select().from(providersTable).orderBy(desc(providersTable.priority)),
    db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)).limit(10),
    db.select().from(sandboxExecutionsTable).where(
      gte(sandboxExecutionsTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
    ),
  ]);

  const summary = {
    totalSessions: sessions.length,
    totalPlans: plans.length,
    totalTasks: tasks.length,
    totalArtifacts: artifacts.length,
    totalWorkspaces: workspaces.length,
    activeTasks: tasks.filter(t => t.status === "running" || t.status === "queued").length,
    completedTasks: tasks.filter(t => t.status === "completed").length,
    failedTasks: tasks.filter(t => t.status === "failed").length,
    tokensUsedToday: 0,
    sandboxExecutionsToday: sandboxToday.length,
    recentEvents,
    providerHealth: providers.map(p => ({ ...p, apiKey: undefined })),
  };

  res.json(summary);
});

export default router;
