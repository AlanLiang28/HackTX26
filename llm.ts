// One place that talks to Meta's Model API (Muse). Both server.ts and game-routes.ts use it,
// so switching models or providers later means editing only this file.
//
// .env:
//   MODEL_API_KEY=...        (META_API_KEY or MUSE_API also work)
//   MUSE_MODEL=muse-spark-1.3   (optional; try muse-spark-1.1 if 1.3 isn't recognized)
//   META_API_BASE=...           (optional; defaults to https://api.meta.ai/v1)

// Env is read lazily: ESM hoists imports, so process.loadEnvFile() in server.ts runs after this file loads.
const apiKey = () => process.env.MODEL_API_KEY ?? process.env.META_API_KEY ?? process.env.MUSE_API; // MUSE_API is what coach.ts uses
const baseUrl = () => (process.env.META_API_BASE ?? "https://api.meta.ai/v1").replace(/\/$/, "");
export const modelName = () => process.env.MUSE_MODEL ?? "muse-spark-1.3";

// An error whose message is safe and useful to show the player.
export class LlmError extends Error {}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "Meta rejected the API key. Check MODEL_API_KEY in .env.";
  if (status === 404) return `Meta doesn't recognize the model "${modelName()}". Set MUSE_MODEL in .env (try muse-spark-1.1).`;
  if (status === 429) return "Meta's rate limit was reached. Wait a moment and try again.";
  if (status === 400) return `Meta rejected the request. Check that MUSE_MODEL ("${modelName()}") is valid.`;
  return `Meta's API had a problem (status ${status}). Try again.`;
}

// Send one prompt, get the model's text back.
export async function generateText(prompt: string): Promise<string> {
  const key = apiKey();
  if (!key) throw new LlmError("Server is missing MODEL_API_KEY. Add it to .env and restart the server.");

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelName(),
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 16000,
      }),
    });
  } catch (e) {
    console.error("Muse request failed:", e);
    throw new LlmError("Couldn't reach Meta's API. Check your internet connection.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Muse API error ${res.status}:`, detail.slice(0, 500));
    throw new LlmError(messageForStatus(res.status));
  }

  const data: unknown = await res.json().catch(() => null);
  const message = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text) : "")).join("");
  }
  throw new LlmError("Meta's API returned an empty answer. Try again.");
}

// Models sometimes wrap JSON in fences or add a sentence around it. Grab the outermost {...}.
export function parseJsonLoose(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON found in the model's answer.");
  return JSON.parse(text.slice(start, end + 1));
}
