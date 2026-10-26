import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { getStats } from "../controllers/dashboardController";

const router = Router();

router.get("/stats", authenticate, getStats);

export default router;
