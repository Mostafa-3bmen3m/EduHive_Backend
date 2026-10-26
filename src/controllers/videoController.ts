import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import prisma from "../utils/prisma";
import {
  getYoutubeTranscriptSegments,
  buildTimestampedTranscript,
  getVideoDuration,
} from "../services/videoService";
import { generateContent } from "../services/aiService";
import { z } from "zod";

// ── Zod schema to validate the AI response ──────────────────────────
const QuestionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.number().int().min(0).max(3),
});

const TimelineSegmentSchema = z.object({
  title: z.string().min(3),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  explanation: z.string().min(30),
  questions: z.array(QuestionSchema).min(2).max(4),
});

const AIResponseSchema = z.object({
  videoTitle: z.string().min(3),
  videoSummary: z.string().min(50),
  timelines: z.array(TimelineSegmentSchema).min(2).max(8),
});

interface AITimelineQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface AITimelineSegment {
  title: string;
  startTime: string;
  endTime: string;
  explanation: string;
  questions: AITimelineQuestion[];
}

interface AITimelineResponse {
  videoTitle: string;
  videoSummary: string;
  timelines: AITimelineSegment[];
}

// ── Build the AI prompt ─────────────────────────────────────────────
const buildPrompt = (
  timestampedTranscript: string,
  videoDuration: string,
): string => {
  return `You are an expert educational content analyst. Your job is to analyze a YouTube video transcript and create a detailed, structured timeline breakdown for students.

INSTRUCTIONS:
1. Read the entire timestamped transcript carefully.
2. Identify 3–6 distinct logical sections/topics discussed in the video.
3. For each section, determine accurate start and end timestamps based on the transcript timestamps provided.
4. Write a clear, detailed explanation (at least 2-3 sentences) of what is covered in each section.
5. Create 2-3 thought-provoking multiple-choice questions per section that test understanding of the content.
6. Each question must have exactly 4 options and a correctAnswer field (0-3 index of the correct option).

IMPORTANT RULES:
- Timestamps MUST be in MM:SS format (e.g., "00:00", "05:30", "12:15")
- The first timeline MUST start at "00:00"
- The last timeline's endTime should be close to "${videoDuration}" (the video duration)
- Timelines must NOT overlap and must be in chronological order
- Explanations must be detailed and educational, summarizing the key points discussed
- Questions must be specific to the content of that timeline section, not generic
- Options must be plausible — avoid obviously wrong answers
- RETURN ONLY valid JSON, no markdown, no code fences, no extra text

OUTPUT FORMAT (strict JSON):
{
  "videoTitle": "A descriptive title for the video based on its content",
  "videoSummary": "A comprehensive 3-4 sentence summary of the entire video",
  "timelines": [
    {
      "title": "Section title describing the topic",
      "startTime": "00:00",
      "endTime": "03:45",
      "explanation": "Detailed explanation of what is discussed in this section. Include key concepts, definitions, and important points covered by the speaker.",
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

TRANSCRIPT (with timestamps):
${timestampedTranscript}`;
};

// ── Main controller ─────────────────────────────────────────────────
export const processVideo = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "A valid YouTube URL is required" });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // 1. Fetch timestamped transcript segments
    let segments;
    try {
      segments = await getYoutubeTranscriptSegments(url);
    } catch {
      res.status(400).json({
        error: "Failed to get transcript. The video might not have captions.",
      });
      return;
    }

    if (segments.length === 0) {
      res
        .status(400)
        .json({ error: "The transcript is empty. Cannot process this video." });
      return;
    }

    const timestampedTranscript = buildTimestampedTranscript(segments);
    const videoDuration = getVideoDuration(segments);
    const plainTranscript = segments.map((s) => s.text).join(" ");

    // 2. Save File record
    const file = await prisma.file.create({
      data: {
        userId: req.user.id,
        filename: "YouTube Video",
        path: url,
        type: "VIDEO_LINK",
        content: plainTranscript,
      },
    });

    // 3. AI Processing — send timestamped transcript
    const prompt = buildPrompt(
      timestampedTranscript.substring(0, 25000),
      videoDuration,
    );

    const aiResponse = await generateContent([
      { role: "user", content: prompt },
    ]);

    // 4. Parse & validate the AI response
    let parsed: AITimelineResponse;
    try {
      // Strip potential markdown code fences
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
      }

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in AI response");
      }

      const raw = JSON.parse(jsonMatch[0]);
      parsed = AIResponseSchema.parse(raw);
    } catch (parseError: any) {
      console.error("AI response validation failed:", parseError.message);
      // Attempt a retry with stricter instructions
      const retryPrompt = `Your previous response was invalid JSON or did not match the required schema. 
Error: ${parseError.message}
Please try again. Remember: RETURN ONLY valid JSON, no markdown fences, no extra text.
${prompt}`;

      const retryResponse = await generateContent([
        { role: "user", content: retryPrompt },
      ]);

      let retryCleaned = retryResponse.trim();
      if (retryCleaned.startsWith("```")) {
        retryCleaned = retryCleaned
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
      }

      const retryJsonMatch = retryCleaned.match(/\{[\s\S]*\}/);
      if (!retryJsonMatch) {
        res
          .status(500)
          .json({ error: "AI failed to generate a valid response" });
        return;
      }

      const retryRaw = JSON.parse(retryJsonMatch[0]);
      parsed = AIResponseSchema.parse(retryRaw);
    }

    // 5. Store timelines in the database
    const createdTimelines = [];
    for (let i = 0; i < parsed.timelines.length; i++) {
      const t = parsed.timelines[i];
      const timeline = await prisma.videoTimeline.create({
        data: {
          fileId: file.id,
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          explanation: t.explanation,
          questions: t.questions as any,
          order: i + 1,
        },
      });
      createdTimelines.push(timeline);
    }

    // 6. Update file with a summary
    await prisma.file.update({
      where: { id: file.id },
      data: {
        filename: parsed.videoTitle,
        summary: parsed.videoSummary,
      },
    });

    // 7. Return structured response
    res.json({
      file: {
        id: file.id,
        filename: parsed.videoTitle,
        path: file.path,
        type: file.type,
        summary: parsed.videoSummary,
        createdAt: file.createdAt,
      },
      timelines: createdTimelines,
    });
  } catch (error) {
    console.error("Video processing error:", error);
    res.status(500).json({ error: "Video processing failed" });
  }
};

// ── Get user's processed videos with timelines ──────────────────────
export const getUserVideos = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const videos = await prisma.file.findMany({
      where: {
        userId: req.user.id,
        type: "VIDEO_LINK",
      },
      include: {
        timelines: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ videos });
  } catch (error) {
    console.error("Failed to fetch videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
};
