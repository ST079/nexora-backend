import { GoogleGenAI } from "@google/genai";
import config from "../config/config.js";

// Created on first use so a missing GEMINI_API_KEY can't stop the API booting.
let ai;

const promptAi = async (promptMessage) => {
  if (!ai) ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: promptMessage,
  });

  const text =
    response?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No description available.";

  return text.replace(/\\n/g, "\n").trim();
};

export default promptAi;
