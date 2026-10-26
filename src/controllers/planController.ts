import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import prisma from "../utils/prisma";
import { generateContent } from "../services/aiService";
import { z } from "zod";

const planSchema = z.object({
  date: z.string().datetime(), // ISO Date string
  tasks: z.array(z.string()),
  goals: z.string().optional(),
});

export const createPlan = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { date, tasks, goals } = planSchema.parse(req.body);

    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const prompt = `
      The student has the following tasks to do on ${date}:
      ${tasks.map((t: string, i: number) => `- ${t}`).join("\n")}
      
      Their goal is: ${goals || "Finish everything efficiently."}
      
      Create a detailed daily schedule including study blocks and breaks. 
      Return the result as a JSON object with a 'schedule' array where each item has 'time', 'activity', and 'type' (study, break, other).
    `;

    const aiResponse = await generateContent([
      { role: "user", content: prompt },
    ]);

    let scheduleData = [];
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scheduleData = parsed.schedule || [];
      }
    } catch (e) {
      console.error("Failed to parse AI schedule", e);
    }

    const plan = await prisma.schedule.create({
      data: {
        userId: req.user.id,
        date: new Date(date),
        tasks: scheduleData,
      },
    });

    res.json(plan);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to create plan" });
  }
};

export const getPlans = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const plans = await prisma.schedule.findMany({
      where: { userId: req.user.id },
      orderBy: { date: "desc" },
    });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};
