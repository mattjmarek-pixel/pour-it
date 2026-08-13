import { Router, type IRouter } from "express";
import healthRouter from "./health";
import claudeRouter from "./claude";
import identifyRouter from "./identify";
import locationRouter from "./location";
import recipesRouter from "./recipes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(claudeRouter);
router.use(identifyRouter);
router.use(locationRouter);
router.use("/recipes", recipesRouter);

export default router;
