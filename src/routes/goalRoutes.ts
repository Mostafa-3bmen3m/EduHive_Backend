import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import {
  createGoal,
  getGoals,
  getGoalById,
  getTodayPlan,
  updateGoalStatus,
  deleteGoal,
} from "../controllers/goalController";

const router = Router();

router.post("/", authenticate, createGoal);
router.get("/", authenticate, getGoals);
router.get("/today", authenticate, getTodayPlan);
router.get("/:id", authenticate, getGoalById);
router.patch("/:id/status", authenticate, updateGoalStatus);
router.delete("/:id", authenticate, deleteGoal);

export default router;
