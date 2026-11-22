import { GoogleGenAI } from "@google/genai";
import config from "../config/config.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Created on first use so a missing GEMINI_API_KEY can't stop the API booting.
let ai;

const isAiConfigured = () => Boolean(config.geminiApiKey);

// Returns the model's text, or "" when it sent none back. Thinking is off:
// marketing copy doesn't need it, and it keeps the reply inside a few seconds.
const promptAi = async (promptMessage) => {
  if (!ai) ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: promptMessage,
    config: { thinkingConfig: { thinkingBudget: 0 } },
  });

  return (response?.text ?? "").replace(/\\n/g, "\n").trim();
};

export { isAiConfigured };
export default promptAi;
