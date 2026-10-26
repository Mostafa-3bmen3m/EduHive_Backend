import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

import authRoutes from "./routes/authRoutes";
import resourceRoutes from "./routes/resourceRoutes";
import planRoutes from "./routes/planRoutes";
import videoRoutes from "./routes/videoRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import goalRoutes from "./routes/goalRoutes";

import { apiLimiter, authLimiter } from "./middlewares/rateLimiter";
import { errorHandler } from "./middlewares/errorHandler";

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[${new RegExp(".*").test("") ? new Date().toISOString() : ""}] ${req.method} ${req.url}`,
  );
  next();
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);

app.use("/api/auth", authRoutes); // Auth routes
app.use("/api/resources", resourceRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/goals", goalRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "EduHive Backend is running" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
