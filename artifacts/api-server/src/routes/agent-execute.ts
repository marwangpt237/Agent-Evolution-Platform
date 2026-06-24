import { Router, type IRouter } from "express";
import { db, sessionsTable, plansTable, planStepsTable, tasksTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPlanFromBrief } from "../lib/agent/planner";
import { executePlanStep } from "../lib/agent/executor";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/agent/execute
 * Body: { sessionId: number, brief: string }
 *
 * Creates a plan from the brief, attaches it to the session, and begins executing
 * the steps in the background. The plan and its execution status are returned.
 */
router.post("/agent/execute", async (req, res): Promise<void> => {
  const sessionId = Number(req.body.sessionId);
  const brief = String(req.body.brief || "").trim();

  if (!sessionId || !brief) {
    res.status(400).json({ error: "sessionId and brief are required" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  try {
    const planSpec = await createPlanFromBrief(brief);

    const [plan] = await db.insert(plansTable).values({
      title: planSpec.title,
      description: planSpec.description ?? null,
      sessionId,
      totalSteps: planSpec.steps.length,
    }).returning();

    if (planSpec.steps.length > 0) {
      await db.insert(planStepsTable).values(
        planSpec.steps.map((s, i) => ({
          planId: plan.id,
          title: s.title,
          description: s.description ?? null,
          order: s.order ?? i,
          agentType: s.agentType ?? "coder",
          dependsOn: s.dependsOn ?? null,
        }))
      );
    }

    await db.insert(eventsTable).values({
      eventType: "plan.created",
      entityType: "plan",
      entityId: plan.id,
      description: `Plan "${plan.title}" created from brief`,
    });

    // Start execution in the background
    void executePlan(plan.id, sessionId, brief);

    res.status(201).json(plan);
  } catch (err) {
    logger.error({ err }, "Agent execution failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function executePlan(planId: number, sessionId: number, brief: string) {
  try {
    await db.update(plansTable).set({ status: "executing" }).where(eq(plansTable.id, planId));

    const steps = await db.select().from(planStepsTable)
      .where(eq(planStepsTable.planId, planId))
      .orderBy(planStepsTable.order);

    for (const step of steps) {
      await executePlanStep(step.id, planId, sessionId);
    }

    const finalSteps = await db.select().from(planStepsTable).where(eq(planStepsTable.planId, planId));
    const allCompleted = finalSteps.every(s => s.status === "completed");

    await db.update(plansTable)
      .set({ status: allCompleted ? "completed" : "failed" })
      .where(eq(plansTable.id, planId));
  } catch (err) {
    logger.error({ err, planId }, "Plan execution failed");
    await db.update(plansTable).set({ status: "failed" }).where(eq(plansTable.id, planId));
  }
}

export default router;
