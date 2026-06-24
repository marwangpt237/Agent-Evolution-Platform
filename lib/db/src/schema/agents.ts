import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentInstancesTable = pgTable("agent_instances", {
  id: serial("id").primaryKey(),
  agentType: text("agent_type").notNull(),
  status: text("status").notNull().default("idle"),
  currentTaskId: integer("current_task_id"),
  sessionId: integer("session_id"),
  model: text("model"),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertAgentInstanceSchema = createInsertSchema(agentInstancesTable).omit({ id: true, createdAt: true });
export type InsertAgentInstance = z.infer<typeof insertAgentInstanceSchema>;
export type AgentInstance = typeof agentInstancesTable.$inferSelect;
