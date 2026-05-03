import { Router, type IRouter } from "express";
import healthRouter from "./health";
import claudeRouter from "./claude";
import identifyRouter from "./identify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(claudeRouter);
router.use(identifyRouter);

export default router;
