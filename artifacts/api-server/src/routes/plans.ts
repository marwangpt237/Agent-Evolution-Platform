import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, plansTable, planStepsTable, eventsTable } from "@workspace/db";
import {
  CreatePlanBody, GetPlanParams, UpdatePlanParams, UpdatePlanBody,
  DeletePlanParams, ExecutePlanParams, UpdatePlanStepParams, UpdatePlanStepBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(desc(plansTable.updatedAt));
  res.json(plans);
});

router.post("/plans", async (req, res): Promise<void> => {
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const steps = parsed.data.steps ?? [];
  const [plan] = await db.insert(plansTable).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    sessionId: parsed.data.sessionId ?? null,
    workspaceId: parsed.data.workspaceId ?? null,
    totalSteps: steps.length,
  }).returning();

  if (steps.length > 0) {
    await db.insert(planStepsTable).values(
      steps.map((s, i) => ({
        planId: plan.id,
        title: s.title,
        description: s.description ?? null,
        order: s.order ?? i,
        agentType: s.agentType ?? null,
        dependsOn: s.dependsOn ?? null,
      }))
    );
  }

  await db.insert(eventsTable).values({
    eventType: "plan.created",
    entityType: "plan",
    entityId: plan.id,
    description: `Plan "${plan.title}" created with ${steps.length} steps`,
  });

  res.status(201).json(plan);
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, params.data.id));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  const steps = await db.select().from(planStepsTable)
    .where(eq(planStepsTable.planId, plan.id))
    .orderBy(planStepsTable.order);
  res.json({ ...plan, steps });
});

router.patch("/plans/:id", async (req, res): Promise<void> => {
  const params = UpdatePlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.update(plansTable).set(parsed.data).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

router.delete("/plans/:id", async (req, res): Promise<void> => {
  const params = DeletePlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [plan] = await db.delete(plansTable).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.sendStatus(204);
});

router.post("/plans/:id/execute", async (req, res): Promise<void> => {
  const params = ExecutePlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [plan] = await db.update(plansTable)
    .set({ status: "executing" })
    .where(eq(plansTable.id, params.data.id))
    .returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  await db.insert(eventsTable).values({
    eventType: "plan.executing",
    entityType: "plan",
    entityId: plan.id,
    description: `Plan "${plan.title}" execution started`,
  });
  res.json(plan);
});

router.patch("/plans/:id/steps/:stepId", async (req, res): Promise<void> => {
  const params = UpdatePlanStepParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePlanStepBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [step] = await db.update(planStepsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(planStepsTable.id, params.data.stepId))
    .returning();
  if (!step) { res.status(404).json({ error: "Step not found" }); return; }

  // Recalculate completedSteps
  const allSteps = await db.select().from(planStepsTable).where(eq(planStepsTable.planId, params.data.id));
  const completed = allSteps.filter(s => s.status === "completed").length;
  await db.update(plansTable).set({ completedSteps: completed }).where(eq(plansTable.id, params.data.id));

  res.json(step);
});

export default router;
