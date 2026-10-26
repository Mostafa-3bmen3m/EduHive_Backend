import fs from "fs";
import { PDFParse } from "pdf-parse";

export const extractTextFromFile = async (
  filePath: string,
  mimeType: string,
): Promise<string> => {
  try {
    if (mimeType === "application/pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      return data.text;
    }
    if (mimeType.startsWith("text/")) {
      return fs.readFileSync(filePath, "utf-8");
    }

    return "";
  } catch (error) {
    console.error("Error extracting text:", error);
    throw error;
  }
};
