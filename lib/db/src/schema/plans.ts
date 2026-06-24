import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  totalSteps: integer("total_steps").notNull().default(0),
  completedSteps: integer("completed_steps").notNull().default(0),
  sessionId: integer("session_id"),
  workspaceId: integer("workspace_id"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const planStepsTable = pgTable("plan_steps", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  status: text("status").notNull().default("pending"),
  agentType: text("agent_type"),
  output: text("output"),
  dependsOn: integer("depends_on").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlanStepSchema = createInsertSchema(planStepsTable).omit({ id: true, createdAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type InsertPlanStep = z.infer<typeof insertPlanStepSchema>;
export type Plan = typeof plansTable.$inferSelect;
export type PlanStep = typeof planStepsTable.$inferSelect;
