import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const artifactsTable = pgTable("artifacts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artifactType: text("artifact_type").notNull().default("text"),
  content: text("content"),
  filePath: text("file_path"),
  creatorAgent: text("creator_agent").notNull(),
  taskId: integer("task_id"),
  workspaceId: integer("workspace_id"),
  version: integer("version").notNull().default(1),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArtifactSchema = createInsertSchema(artifactsTable).omit({ id: true, createdAt: true });
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;
export type Artifact = typeof artifactsTable.$inferSelect;
