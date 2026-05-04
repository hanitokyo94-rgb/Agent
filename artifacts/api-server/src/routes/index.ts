import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import userRouter from "./user.js";
import projectsRouter from "./projects.js";
import messagesRouter from "./messages.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(userRouter);
router.use(projectsRouter);
router.use(messagesRouter);

export default router;
