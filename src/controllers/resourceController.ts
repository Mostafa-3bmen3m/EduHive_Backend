import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import prisma from "../utils/prisma";
import { extractTextFromFile } from "../services/fileProcessingService";
import { generateContent } from "../services/aiService";
import { z } from "zod";
// import { getYoutubeTranscript } from '../services/videoService'; // To be implemented

const quizSchema = z.object({
  fileId: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

// ── Zod schema to validate the AI response ──────────────────────────
const QuestionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.number().int().min(0).max(3),
});

const ResourceSectionSchema = z.object({
  title: z.string().min(3),
  explanation: z.string().min(30),
  questions: z.array(QuestionSchema).min(2).max(4),
});

const AIResponseSchema = z.object({
  documentTitle: z.string().min(3),
  documentSummary: z.string().min(50),
  sections: z.array(ResourceSectionSchema).min(2).max(8),
});

// ── Controller definitions ──────────────────────────────────────────

export const uploadFile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  console.log("UPLOAD FILE CALLED", {
    file: req.file,
    user: req.user,
  });

  if (!req.file || !req.user) {
    res
      .status(400)
      .json({ error: "No file uploaded or user not authenticated" });
    return;
  }

  const fileInfo = req.file;
  const userInfo = req.user;

  try {
    const text = await extractTextFromFile(fileInfo.path, fileInfo.mimetype);

    // Prompt the AI to break the document into lessons/sections, explain them, and create questions
    const prompt = `You are an expert AI tutor. 
Analyze the following document and classify it into lessons (if the document contains units and lessons). If it does not contain explicit units/lessons, then break it down into 2 to 6 logical learning sections based on the content.
For each lesson/section, provide:
1. A descriptive title (e.g., "Lesson 1: Intro" or "Core Concept: Photosynthesis").
2. A detailed explanation of the section's core concepts.
3. A 2 to 4 question multiple-choice quiz covering the section.

Return ONLY a valid JSON object matching the following structure exactly. Do not include markdown codeblocks (\`\`\`).

{
  "documentTitle": "A descriptive title for the overall document",
  "documentSummary": "A comprehensive 3-4 sentence summary of the entire document",
  "sections": [
    {
      "title": "Section title describing the topic",
      "explanation": "Detailed explanation of what is discussed in this section. Include key concepts, definitions, and important points.",
      "questions": [
        {
          "question": "A specific question about this section's content?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": 0
        }
      ]
    }
  ]
}

DOCUMENT CONTENT:
${text.substring(0, 15000)}`;

    const responseText = await generateContent([
      { role: "user", content: prompt },
    ]);
    let cleanJson = responseText
      .replace(/```(?:json)?\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = AIResponseSchema.parse(JSON.parse(cleanJson));

    const file = await prisma.file.create({
      data: {
        userId: userInfo.id,
        filename: parsed.documentTitle || fileInfo.originalname,
        path: fileInfo.path,
        type: "PDF",
        content: text,
        summary: parsed.documentSummary,
      },
    });

    const createdSections = [];
    for (const [index, section] of parsed.sections.entries()) {
      const created = await prisma.resourceSection.create({
        data: {
          fileId: file.id,
          title: section.title,
          explanation: section.explanation,
          questions: section.questions,
          order: index,
        },
      });
      createdSections.push(created);
    }

    res.json({
      file,
      sections: createdSections,
    });
  } catch (error: any) {
    console.error("Resource processing error:", error);
    res.status(500).json({
      error: "File processing failed",
      details: error?.message || String(error),
      stack: error?.stack,
    });
  }
};

// ── Get user's processed resources with sections ────────────────────
export const getUserResources = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const files = await prisma.file.findMany({
      where: {
        userId: req.user.id,
        type: { not: "VIDEO_LINK" },
      },
      include: {
        resourceSections: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(files);
  } catch (error) {
    console.error("Fetch resources error:", error);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
};
