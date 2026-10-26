import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

/**
 * Formats seconds into MM:SS string
 */
export const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/**
 * Extracts video ID from YouTube URL
 */
function extractVideoId(url: string): string {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : url;
}

/**
 * Fetches the YouTube transcript using child_process and @playzone/youtube-transcript CLI
 * Returns an array of { text, offset, duration } segments.
 */
export const getYoutubeTranscriptSegments = async (
  videoIdOrUrl: string,
): Promise<TranscriptSegment[]> => {
  try {
    const videoId = extractVideoId(videoIdOrUrl);

    // Execute the CLI tool that is known to bypass bot protections
    const { stdout, stderr } = await execAsync(
      `npx @playzone/youtube-transcript ${videoId}`,
    );

    if (!stdout || stdout.trim() === "") {
      console.warn("No transcript data returned from CLI.");
      return [];
    }

    // CLI outputs JSON array of the transcript
    const rawData = JSON.parse(stdout.trim());

    if (!Array.isArray(rawData)) {
      console.warn("Transcript data from CLI is not an array.");
      return [];
    }

    let transcriptItems = rawData;
    if (rawData.length > 0 && Array.isArray(rawData[0])) {
      transcriptItems = rawData[0];
    }

    const segments: TranscriptSegment[] = transcriptItems.map((item: any) => {
      let textStr = "";
      if (typeof item.text === "string") textStr = item.text;
      else if (item.text) textStr = String(item.text);

      return {
        text: textStr.replace(/\r?\n|\r/g, " ").trim(), // clean line breaks
        offset: parseFloat(item.start) || 0,
        duration: parseFloat(item.duration) || 0,
      };
    });

    return segments;
  } catch (error) {
    console.error("Failed to fetch transcript via CLI", error);
    throw new Error("Could not fetch transcript for video");
  }
};

/**
 * Builds a timestamped transcript string for the AI prompt.
 * Format: [MM:SS] text content here
 */
export const buildTimestampedTranscript = (
  segments: TranscriptSegment[],
): string => {
  return segments
    .map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`)
    .join("\n");
};

/**
 * Gets the total duration of the video from segments.
 */
export const getVideoDuration = (segments: TranscriptSegment[]): string => {
  if (segments.length === 0) return "00:00";
  const last = segments[segments.length - 1];
  return formatTimestamp(last.offset + last.duration);
};
