import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sandboxExecutionsTable = pgTable("sandbox_executions", {
  id: serial("id").primaryKey(),
  language: text("language").notNull(),
  code: text("code").notNull(),
  stdout: text("stdout"),
  stderr: text("stderr"),
  exitCode: integer("exit_code"),
  status: text("status").notNull().default("running"),
  executionMs: integer("execution_ms"),
  taskId: integer("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSandboxExecutionSchema = createInsertSchema(sandboxExecutionsTable).omit({ id: true, createdAt: true });
export type InsertSandboxExecution = z.infer<typeof insertSandboxExecutionSchema>;
export type SandboxExecution = typeof sandboxExecutionsTable.$inferSelect;
