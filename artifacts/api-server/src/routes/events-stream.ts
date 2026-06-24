import { Router, type IRouter } from "express";
import { subscribeToEvents } from "../lib/events-stream";
import type { InsertEvent } from "@workspace/db";

const router: IRouter = Router();

router.get("/events/stream", async (req, res): Promise<void> => {
  const entityTypes = req.query.entityTypes ? String(req.query.entityTypes).split(",") : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: InsertEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = subscribeToEvents(send, (event) => {
    if (!entityTypes) return true;
    return entityTypes.includes(event.entityType);
  });

  req.on("close", () => {
    unsubscribe();
  });

  // Keep connection alive
  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;
