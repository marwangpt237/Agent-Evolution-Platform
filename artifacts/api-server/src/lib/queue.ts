import { db, tasksTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Task Queue Manager using PostgreSQL SKIP LOCKED
 * This provides a lightweight, concurrent-safe task queue without external dependencies like Redis.
 */
export class TaskQueue {
  private static isProcessing = false;
  private static pollInterval: NodeJS.Timeout | null = null;

  /**
   * Start the task processor loop
   */
  static startProcessor(intervalMs = 5000) {
    if (this.pollInterval) return;
    
    logger.info({ intervalMs }, "Starting task processor loop");
    this.pollInterval = setInterval(() => this.processNextTask(), intervalMs);
    
    // Process immediately on start
    void this.processNextTask();
  }

  /**
   * Stop the task processor loop
   */
  static stopProcessor() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info("Stopped task processor loop");
    }
  }

  /**
   * Pick the next available task and process it
   * Uses FOR UPDATE SKIP LOCKED to ensure multiple workers don't pick the same task
   */
  private static async processNextTask() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Pick and lock the next task
      // We look for 'pending' tasks or 'failed' tasks that haven't reached max retries
      const [task] = await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          UPDATE tasks
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE id = (
            SELECT id
            FROM tasks
            WHERE status = 'pending' OR (status = 'failed' AND retry_count < max_retries)
            ORDER BY priority DESC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING *
        `);
        return result.rows as any[];
      });

      if (!task) {
        this.isProcessing = false;
        return;
      }

      logger.info({ taskId: task.id, agentType: task.agent_type }, "Processing task");

      // 2. Execute the task based on agent type
      // For now, we'll simulate execution. In a real scenario, this would call agent logic.
      try {
        const output = await this.executeTaskLogic(task);
        
        // 3. Mark task as completed
        await db.update(tasksTable)
          .set({
            status: 'completed',
            output,
            completedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(tasksTable.id, task.id));
          
        logger.info({ taskId: task.id }, "Task completed successfully");
      } catch (err) {
        // 4. Handle task failure
        const errorMessage = err instanceof Error ? err.message : String(err);
        const nextRetryCount = (task.retry_count || 0) + 1;
        
        await db.update(tasksTable)
          .set({
            status: 'failed',
            errorMessage,
            retryCount: nextRetryCount,
            updatedAt: new Date()
          })
          .where(eq(tasksTable.id, task.id));
          
        logger.error({ taskId: task.id, error: errorMessage, retry: nextRetryCount }, "Task failed");
      }
    } catch (err) {
      logger.error({ err }, "Error in task processor");
    } finally {
      this.isProcessing = false;
      // Immediately check for more tasks if we just finished one
      void this.processNextTask();
    }
  }

  /**
   * Placeholder for actual agent execution logic
   */
  private static async executeTaskLogic(task: any): Promise<string> {
    // This is where we would dispatch to Supervisor, Planner, etc.
    // For MVP/Manus-style, we'll add a small delay to simulate "thinking"
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return `Executed task "${task.title}" using ${task.agent_type} agent. Output generated at ${new Date().toISOString()}`;
  }
}
