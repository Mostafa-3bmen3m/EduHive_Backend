import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);

  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Validation Error", details: err.issues });
    return; // Ensure to return to avoid falling through
  }

  res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};
