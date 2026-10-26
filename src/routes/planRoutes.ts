import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { createPlan, getPlans } from "../controllers/planController";

const router = Router();

router.post("/", authenticate, createPlan);
router.get("/", authenticate, getPlans);

export default router;
