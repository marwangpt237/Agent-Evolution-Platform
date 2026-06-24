import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, providersTable } from "@workspace/db";
import {
  CreateProviderBody, UpdateProviderParams, UpdateProviderBody,
  DeleteProviderParams, TestProviderParams,
} from "@workspace/api-zod";
import { testProviderHealth, type ProviderType } from "../lib/ai";

const router: IRouter = Router();

router.get("/providers", async (_req, res): Promise<void> => {
  const providers = await db.select().from(providersTable).orderBy(desc(providersTable.priority));
  // Strip api keys from response
  res.json(providers.map(p => ({ ...p, apiKey: undefined })));
});

router.post("/providers", async (req, res): Promise<void> => {
  const parsed = CreateProviderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [provider] = await db.insert(providersTable).values({
    name: parsed.data.name,
    providerType: parsed.data.providerType,
    baseUrl: parsed.data.baseUrl ?? null,
    defaultModel: parsed.data.defaultModel ?? null,
    apiKey: parsed.data.apiKey ?? null,
    priority: parsed.data.priority ?? 0,
  }).returning();
  res.status(201).json({ ...provider, apiKey: undefined });
});

router.patch("/providers/:id", async (req, res): Promise<void> => {
  const params = UpdateProviderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProviderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [provider] = await db.update(providersTable).set(parsed.data).where(eq(providersTable.id, params.data.id)).returning();
  if (!provider) { res.status(404).json({ error: "Provider not found" }); return; }
  res.json({ ...provider, apiKey: undefined });
});

router.delete("/providers/:id", async (req, res): Promise<void> => {
  const params = DeleteProviderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [p] = await db.delete(providersTable).where(eq(providersTable.id, params.data.id)).returning();
  if (!p) { res.status(404).json({ error: "Provider not found" }); return; }
  res.sendStatus(204);
});

router.post("/providers/:id/test", async (req, res): Promise<void> => {
  const params = TestProviderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, params.data.id));
  if (!provider) { res.status(404).json({ error: "Provider not found" }); return; }

  const result = await testProviderHealth(provider.providerType as ProviderType, provider.defaultModel ?? undefined);

  // Update health status
  await db.update(providersTable).set({
    isHealthy: result.success,
    latencyMs: result.latencyMs,
    lastCheckedAt: new Date(),
  }).where(eq(providersTable.id, provider.id));

  res.json(result);
});

router.get("/providers/active", async (_req, res): Promise<void> => {
  const providers = await db.select().from(providersTable)
    .where(eq(providersTable.isActive, true))
    .orderBy(desc(providersTable.priority));
  const active = providers.find(p => p.isHealthy) ?? providers[0] ?? null;
  if (!active) { res.status(404).json({ error: "No active provider" }); return; }
  res.json({ ...active, apiKey: undefined });
});

export default router;
