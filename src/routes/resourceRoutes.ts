import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authMiddleware";
import {
  uploadFile,
  getUserResources,
} from "../controllers/resourceController";

const upload = multer({ dest: "uploads/" });
const router = Router();

router.get("/", authenticate, getUserResources);
router.post("/upload", authenticate, upload.single("file"), uploadFile);

export default router;
