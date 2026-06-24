import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";
import { ListEventsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/events", async (req, res): Promise<void> => {
  const query = ListEventsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const limit = query.data.limit ?? 50;
  const events = await db.select().from(eventsTable)
    .orderBy(desc(eventsTable.createdAt))
    .limit(limit);
  res.json(events);
});

export default router;
