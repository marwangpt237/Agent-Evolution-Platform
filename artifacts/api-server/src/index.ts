import app from "./app";
import { logger } from "./lib/logger";
import { db, providersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { testProviderHealth, type ProviderType } from "./lib/ai";
import { TaskQueue } from "./lib/queue";

const port = Number(process.env.PORT || "5000");

async function runStartupHealthChecks() {
  try {
    const providers = await db.select().from(providersTable).where(eq(providersTable.isActive, true));
    if (providers.length === 0) return;

    logger.info({ count: providers.length }, "Running startup provider health checks");

    await Promise.allSettled(
      providers.map(async (provider) => {
        const result = await testProviderHealth(
          provider.providerType as ProviderType,
          provider.defaultModel ?? undefined
        );
        await db.update(providersTable)
          .set({
            isHealthy: result.success,
            latencyMs: result.latencyMs,
            lastCheckedAt: new Date(),
          })
          .where(eq(providersTable.id, provider.id));

        logger.info(
          { provider: provider.name, healthy: result.success, latencyMs: result.latencyMs },
          "Provider health check complete"
        );
      })
    );
  } catch (err) {
    logger.warn({ err }, "Startup health checks failed — continuing anyway");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run health checks in background after server is ready
  void runStartupHealthChecks();
  
  // Start the autonomous task processor
  TaskQueue.startProcessor();
});
