import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, artifactsTable, eventsTable } from "@workspace/db";
import {
  ListArtifactsQueryParams, CreateArtifactRecordBody,
  GetArtifactParams, DeleteArtifactParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/artifacts", async (req, res): Promise<void> => {
  const query = ListArtifactsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  let artifacts = await db.select().from(artifactsTable).orderBy(desc(artifactsTable.createdAt));
  if (query.data.workspaceId) artifacts = artifacts.filter(a => a.workspaceId === query.data.workspaceId);
  if (query.data.artifactType) artifacts = artifacts.filter(a => a.artifactType === query.data.artifactType);
  res.json(artifacts);
});

router.post("/artifacts", async (req, res): Promise<void> => {
  const parsed = CreateArtifactRecordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const content = parsed.data.content ?? null;
  const sizeBytes = content ? Buffer.byteLength(content, "utf8") : null;
  const [artifact] = await db.insert(artifactsTable).values({
    title: parsed.data.title,
    artifactType: parsed.data.artifactType,
    content,
    filePath: parsed.data.filePath ?? null,
    creatorAgent: parsed.data.creatorAgent,
    taskId: parsed.data.taskId ?? null,
    workspaceId: parsed.data.workspaceId ?? null,
    sizeBytes,
  }).returning();
  await db.insert(eventsTable).values({
    eventType: "artifact.created",
    entityType: "artifact",
    entityId: artifact.id,
    description: `Artifact "${artifact.title}" created by ${artifact.creatorAgent}`,
  });
  res.status(201).json(artifact);
});

router.get("/artifacts/:id", async (req, res): Promise<void> => {
  const params = GetArtifactParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [artifact] = await db.select().from(artifactsTable).where(eq(artifactsTable.id, params.data.id));
  if (!artifact) { res.status(404).json({ error: "Artifact not found" }); return; }
  res.json(artifact);
});

router.delete("/artifacts/:id", async (req, res): Promise<void> => {
  const params = DeleteArtifactParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [artifact] = await db.delete(artifactsTable).where(eq(artifactsTable.id, params.data.id)).returning();
  if (!artifact) { res.status(404).json({ error: "Artifact not found" }); return; }
  res.sendStatus(204);
});

export default router;
