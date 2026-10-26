import axios from "axios";

const AI_PROXY_URL = "https://ai.hackclub.com/proxy/v1/chat/completions";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY is not set in environment variables.");
}

export const generateContent = async (
  messages: { role: "user" | "system" | "assistant"; content: string }[],
) => {
  try {
    const response = await axios.post(
      AI_PROXY_URL,
      {
        model: "google/gemini-3-flash-preview",
        messages: messages,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("AI Service Error:", error);
    throw new Error("Failed to fetch response from AI");
  }
};
