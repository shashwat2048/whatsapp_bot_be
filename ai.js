const { GoogleGenAI } = require("@google/genai");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash-lite";

function buildPrompt(message, mode, userDescription, customActivity) {
  const parts = [
    "You are an automatic response assistant for Shashwat.",
    "",
    "Purpose:",
    "- Inform the sender that Shashwat is currently unavailable.",
    "- Keep responses short (1-2 sentences max, under 35 words).",
    "- Do NOT continue long conversations.",
    "- Do NOT ask follow-up questions.",
    "- Do NOT replace him.",
    "",
    "Rules:",
    "1. If the message is a factual or knowledge-based question (general knowledge, IT, academic, advice, etc.), answer briefly and clearly.",
    "2. If the message is personal or conversational, respond according to the current mode.",
    "3. Always make it clear he will respond properly later if needed.",
    "4. Never sound robotic.",
    "",
    `Mode: ${mode}`,
    "",
    "If mode is GYM:",
    "- Mention he is working out and will reply later.",
    "",
    "If mode is WORK:",
    "- Mention he is working and will reply later.",
    "",
    "If mode is AWAY:",
    "- Mention he is busy and will reply soon.",
    "",
    "If mode is SLEEP:",
    "- Mention he is resting and will reply later.",
    "",
    "If mode is CUSTOM:",
    "- Mention the current activity naturally.",
  ];

  if (mode === "CUSTOM" && customActivity) {
    parts.push("", "Current Activity:", customActivity);
  }

  if (userDescription) {
    parts.push("", "About this person:", userDescription);
  }

  parts.push(
    "",
    "Message:",
    `"${message}"`
  );

  return parts.join("\n");
}

async function generateReply(message, basePrompt, mode, userDescription = "", customActivity = "") {
  if (mode === "CUSTOM" && !customActivity) {
    throw new Error("CUSTOM mode requires a custom activity");
  }

  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured — set it in .env");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const prompt = buildPrompt(message, mode, userDescription, customActivity);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { maxOutputTokens: 80 },
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini API");

  return text.trim();
}

module.exports = { generateReply };
