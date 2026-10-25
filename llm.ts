// One place that talks to Gemini for text generation. server.ts, game-routes.ts and boss.ts use it,
// so switching models or providers later means editing only this file.
//
// .env:
//   GEMINI_API_KEY=...
//   GEMINI_FALLBACK_API_KEY=...   (optional; a second key, used when GEMINI_API_KEY is out of quota)
//   GEMINI_MODEL=gemini-3.5-flash  (optional)
import { GoogleGenAI } from "@google/genai";

// Env is read lazily: ESM hoists imports, so process.loadEnvFile() in server.ts runs after this file loads.
const apiKey = () => process.env.GEMINI_API_KEY;
export const modelName = () => process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const clients = new Map<string, GoogleGenAI>();
function clientFor(key: string) {
  let client = clients.get(key);
  if (!client) clients.set(key, (client = new GoogleGenAI({ apiKey: key })));
  return client;
}

// An error whose message is safe and useful to show the player.
export class LlmError extends Error {}

const statusOf = (e: unknown) => (e as { status?: number }).status;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A 503 means Gemini is briefly overloaded; it usually clears in seconds, so retry once after a short wait.
async function retryOnOverload<T>(call: (ai: GoogleGenAI) => Promise<T>, ai: GoogleGenAI): Promise<T> {
  try {
    return await call(ai);
  } catch (e) {
    if (statusOf(e) !== 503) throw e;
    console.warn("Gemini is overloaded (503); retrying once.");
    await wait(1500);
    return await call(ai);
  }
}

// Quotas belong to the key's Google Cloud project: when GEMINI_API_KEY is out (429), retry with
// GEMINI_FALLBACK_API_KEY. A backup key from the same project shares the quota and won't help.
export async function withGeminiFallback<T>(call: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = [...new Set([apiKey(), process.env.GEMINI_FALLBACK_API_KEY].filter((k): k is string => !!k))];
  if (!keys.length) throw new LlmError("Server is missing GEMINI_API_KEY. Add it to .env and restart the server.");
  for (let i = 0; ; i++) {
    try {
      return await retryOnOverload(call, clientFor(keys[i]));
    } catch (e) {
      if (statusOf(e) !== 429 || i === keys.length - 1) throw e;
      console.warn("GEMINI_API_KEY is out of quota; trying GEMINI_FALLBACK_API_KEY.");
    }
  }
}

function messageForError(status: number, detail: string): string {
  if (status === 401 || status === 403) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.";
  if (status === 404) return `Gemini doesn't recognize the model "${modelName()}". Set GEMINI_MODEL in .env.`;
  if (status === 429 && /PerDay/i.test(detail))
    return "Gemini's free daily limit is used up. Try again later, or add billing to the Gemini API key.";
  if (status === 429) return "Gemini's rate limit was reached. Wait a moment and try again.";
  if (status === 400) return `Gemini rejected the request. Check that GEMINI_MODEL ("${modelName()}") is valid.`;
  if (status === 503) return "Gemini is overloaded right now. Wait a minute and try again.";
  return `Gemini's API had a problem (status ${status}). Try again.`;
}

// Send one prompt, get the model's text back.
export async function generateText(prompt: string): Promise<string> {
  if (!apiKey()) throw new LlmError("Server is missing GEMINI_API_KEY. Add it to .env and restart the server.");

  let text: string | undefined;
  try {
    const r = await withGeminiFallback((ai) =>
      ai.models.generateContent({ model: modelName(), contents: prompt, config: { maxOutputTokens: 16000 } }),
    );
    text = r.text;
  } catch (e) {
    const status = statusOf(e);
    console.error("Gemini request failed:", e);
    if (typeof status === "number") throw new LlmError(messageForError(status, String((e as Error).message)));
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
