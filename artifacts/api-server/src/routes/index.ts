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
import dashboardRouter from "./dashboard";

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
router.use(eventsRouter);
router.use(dashboardRouter);

export default router;
