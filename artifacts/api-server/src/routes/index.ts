import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import messagesRouter from "./messages";
import plansRouter from "./plans";
import tasksRouter from "./tasks";
import artifactsRouter from "./artifacts";
import workspacesRouter from "./workspaces";
import providersRouter from "./providers";
import agentsRouter from "./agents";
import sandboxRouter from "./sandbox";
import eventsRouter from "./events";
import eventsStreamRouter from "./events-stream";
import dashboardRouter from "./dashboard";
import agentExecuteRouter from "./agent-execute";
import sandboxFilesRouter from "./sandbox-files";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(messagesRouter);
router.use(plansRouter);
router.use(tasksRouter);
router.use(artifactsRouter);
router.use(workspacesRouter);
router.use(providersRouter);
router.use(agentsRouter);
router.use(sandboxRouter);
router.use(sandboxFilesRouter);
router.use(eventsRouter);
router.use(eventsStreamRouter);
router.use(dashboardRouter);
router.use(agentExecuteRouter);

export default router;
