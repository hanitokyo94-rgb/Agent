import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import userRouter from "./user.js";
import projectsRouter from "./projects.js";
import messagesRouter from "./messages.js";
import adminRouter from "./admin.js";
import workspaceRouter from "./workspace.js";
import agentStreamRouter from "./agent-stream.js";
import deployRouter from "./deploy.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(userRouter);
router.use(projectsRouter);
router.use(messagesRouter);
router.use(adminRouter);
router.use(workspaceRouter);
router.use(agentStreamRouter);
router.use(deployRouter);

export default router;
