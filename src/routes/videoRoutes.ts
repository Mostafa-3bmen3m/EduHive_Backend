import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { processVideo, getUserVideos } from "../controllers/videoController";

const router = Router();

router.post("/process", authenticate, processVideo);
router.get("/", authenticate, getUserVideos);

export default router;
