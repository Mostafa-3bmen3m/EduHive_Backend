import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import prisma from "../utils/prisma";
import { generateContent } from "../services/aiService";
import { z } from "zod";

const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string(),
      estimatedHours: z.number().optional(),
    })
  ),
  busyTimes: z.array(
    z.object({
      label: z.string(),
      days: z.string(),
      startTime: z.string(),
      endTime: z.string(),
    })
  ).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hoursPerDay: z.number().min(0.5).max(16),
  priority: z.enum(["low", "medium", "high"]),
});

interface BusyTimeInput {
  label: string;
  days: string;
  startTime: string;
  endTime: string;
}

interface GoalInput {
  title: string;
  description?: string;
  tasks: Array<{ title: string; estimatedHours?: number }>;
  busyTimes?: BusyTimeInput[];
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  priority: string;
}

function buildSchedulePrompt(goal: GoalInput, currentDate: string): string {
  const startDate = new Date(goal.startDate);
  const endDate = new Date(goal.endDate);
  const totalDays =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  const totalHours = totalDays * goal.hoursPerDay;

  return `You are a professional study planner and scheduling AI.

CONTEXT:
- Current date/time: ${currentDate}
- Goal: "${goal.title}"
- Description: ${goal.description || "N/A"}
- Priority: ${goal.priority}
- Timeline: ${goal.startDate} to ${goal.endDate} (${totalDays} days)
- Available hours per day: ${goal.hoursPerDay} hours
- Total available hours: ${totalHours} hours

TASKS TO SCHEDULE:
${goal.tasks.map((t: { title: string; estimatedHours?: number }, i: number) => `${i + 1}. ${t.title}${t.estimatedHours ? ` (estimated: ${t.estimatedHours}h)` : ""}`).join("\n")}
${goal.busyTimes && goal.busyTimes.length > 0 ? `
BUSY TIMES / UNAVAILABLE SLOTS (DO NOT schedule study sessions during these times):
${goal.busyTimes.map((bt: BusyTimeInput, i: number) => `- ${bt.label}: ${bt.days}, ${bt.startTime} to ${bt.endTime}`).join("\n")}

IMPORTANT: You MUST avoid scheduling any study or break sessions that overlap with the busy times listed above. Schedule study sessions ONLY during free time windows around these commitments.
` : ""}
INSTRUCTIONS:
1. Create a detailed day-by-day schedule that distributes the tasks across the available timeline.
2. For each day, create specific time-blocked sessions with start and end times (in HH:MM 24-hour format).
3. Include short breaks (5-10 min) between sessions and a longer break (15-30 min) after every 2 hours.
4. Respect the hoursPerDay limit.
5. Group related tasks together when possible.
6. Place harder/high-priority tasks earlier in the day when focus is highest.
7. Include a brief tip or motivation for each day.

Return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "goalSummary": "Brief summary of the plan",
  "totalDays": ${totalDays},
  "totalHours": ${totalHours},
  "weeklyOverview": [
    {
      "week": 1,
      "focus": "What this week focuses on",
      "days": ["Brief summary for each day"]
    }
  ],
  "dailyPlans": [
    {
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "dayTitle": "Brief title for the day",
      "tip": "Motivational tip or study advice",
      "sessions": [
        {
          "startTime": "09:00",
          "endTime": "09:45",
          "task": "Task name",
          "type": "study",
          "description": "What to focus on"
        },
        {
          "startTime": "09:45",
          "endTime": "09:55",
          "task": "Short Break",
          "type": "break",
          "description": "Rest your eyes, stretch"
        }
      ],
      "totalStudyMinutes": 120
    }
  ]
}`;
}

export const createGoal = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = goalSchema.parse(req.body);

    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const now = new Date();
    const currentDate = now.toISOString();

    const prompt = buildSchedulePrompt(data as GoalInput, currentDate);

    const aiResponse = await generateContent([
      {
        role: "system",
        content:
          "You are a professional study planner. You MUST return ONLY valid JSON. No markdown fences, no extra text.",
      },
      { role: "user", content: prompt },
    ]);

    let aiPlan = null;
    try {
      const cleaned = aiResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiPlan = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI plan:", e);
      console.error("Raw response:", aiResponse.substring(0, 500));
    }

    const goal = await (prisma as any).goal.create({
      data: {
        userId: req.user.id,
        title: data.title,
        description: data.description || null,
        tasks: data.tasks as any,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hoursPerDay: data.hoursPerDay,
        priority: data.priority,
        aiPlan: aiPlan,
      },
    });

    res.json(goal);
  } catch (error: any) {
    console.error("Create goal error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to create goal and schedule" });
  }
};

export const getGoals = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const goals = await (prisma as any).goal.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(goals);
  } catch (error) {
    console.error("Get goals error:", error);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
};

export const getGoalById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const goal = await (prisma as any).goal.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch goal" });
  }
};

export const getTodayPlan = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    const activeGoals = await (prisma as any).goal.findMany({
      where: {
        userId: req.user.id,
        status: "ACTIVE",
        startDate: { lte: new Date(todayStr + "T23:59:59Z") },
        endDate: { gte: new Date(todayStr + "T00:00:00Z") },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    const todayPlans: any[] = [];

    for (const goal of activeGoals) {
      const aiPlan = goal.aiPlan as any;
      if (aiPlan && aiPlan.dailyPlans) {
        const todayPlan = aiPlan.dailyPlans.find(
          (dp: any) => dp.date === todayStr
        );
        if (todayPlan) {
          todayPlans.push({
            goalId: goal.id,
            goalTitle: goal.title,
            priority: goal.priority,
            ...todayPlan,
          });
        }
      }
    }

    res.json({
      date: todayStr,
      goals: activeGoals.length,
      plans: todayPlans,
    });
  } catch (error) {
    console.error("Get today plan error:", error);
    res.status(500).json({ error: "Failed to fetch today's plan" });
  }
};

export const updateGoalStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { status } = req.body;

    if (!["ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const goal = await (prisma as any).goal.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status },
    });

    if (goal.count === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.json({ message: "Goal status updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update goal status" });
  }
};

export const deleteGoal = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const goal = await (prisma as any).goal.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (goal.count === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.json({ message: "Goal deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete goal" });
  }
};
