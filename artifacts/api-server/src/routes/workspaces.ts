import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workspacesTable, eventsTable } from "@workspace/db";
import { CreateWorkspaceBody, GetWorkspaceParams, DeleteWorkspaceParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/workspaces", async (_req, res): Promise<void> => {
  const workspaces = await db.select().from(workspacesTable).orderBy(desc(workspacesTable.createdAt));
  res.json(workspaces);
});

router.post("/workspaces", async (req, res): Promise<void> => {
  const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [workspace] = await db.insert(workspacesTable).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  }).returning();
  await db.insert(eventsTable).values({
    eventType: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
    description: `Workspace "${workspace.name}" created`,
  });
  res.status(201).json(workspace);
});

router.get("/workspaces/:id", async (req, res): Promise<void> => {
  const params = GetWorkspaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [workspace] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, params.data.id));
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }
  res.json(workspace);
});

router.delete("/workspaces/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkspaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [ws] = await db.delete(workspacesTable).where(eq(workspacesTable.id, params.data.id)).returning();
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }
  res.sendStatus(204);
});

export default router;
