import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  baseUrl: text("base_url"),
  defaultModel: text("default_model"),
  apiKey: text("api_key"),
  isActive: boolean("is_active").notNull().default(true),
  isHealthy: boolean("is_healthy").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  latencyMs: integer("latency_ms"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({ id: true, createdAt: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;
