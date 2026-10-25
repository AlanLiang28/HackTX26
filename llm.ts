// One place that talks to Gemini for text generation. Both server.ts and game-routes.ts use it,
// so switching models or providers later means editing only this file.
//
// .env:
//   GEMINI_API_KEY=...
//   GEMINI_MODEL=gemini-3.5-flash   (optional)
import { GoogleGenAI } from "@google/genai";

// Env is read lazily: ESM hoists imports, so process.loadEnvFile() in server.ts runs after this file loads.
const apiKey = () => process.env.GEMINI_API_KEY;
export const modelName = () => process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

let client: GoogleGenAI | null = null;
const gemini = () => (client ??= new GoogleGenAI({ apiKey: apiKey() }));

// An error whose message is safe and useful to show the player.
export class LlmError extends Error {}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.";
  if (status === 404) return `Gemini doesn't recognize the model "${modelName()}". Set GEMINI_MODEL in .env.`;
  if (status === 429) return "Gemini's rate limit was reached. Wait a moment and try again.";
  if (status === 400) return `Gemini rejected the request. Check that GEMINI_MODEL ("${modelName()}") is valid.`;
  return `Gemini's API had a problem (status ${status}). Try again.`;
}

// Send one prompt, get the model's text back.
export async function generateText(prompt: string): Promise<string> {
  if (!apiKey()) throw new LlmError("Server is missing GEMINI_API_KEY. Add it to .env and restart the server.");

  let text: string | undefined;
  try {
    const r = await gemini().models.generateContent({
      model: modelName(),
      contents: prompt,
      config: { maxOutputTokens: 16000 },
    });
    text = r.text;
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.error("Gemini request failed:", e);
    if (typeof status === "number") throw new LlmError(messageForStatus(status));
    throw new LlmError("Couldn't reach Gemini's API. Check your internet connection.");
  }

  if (text) return text;
  throw new LlmError("Gemini's API returned an empty answer. Try again.");
}

// Models sometimes wrap JSON in fences or add a sentence around it. Grab the outermost {...}.
export function parseJsonLoose(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON found in the model's answer.");
  return JSON.parse(text.slice(start, end + 1));
}
