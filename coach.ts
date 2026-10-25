// AI voice explanation: Muse writes a script in character, Gemini TTS performs it.
// Muse needs META_API_KEY (or MUSE_API); without one, Gemini writes the script instead.
// Add to server.ts:   import { registerCoachRoute } from "./coach";
//                     registerCoachRoute(app);      (after app.use(express.json(...)))
import type { Express } from "express";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// Who's talking for each theme. voice = a Gemini prebuilt voice name.
const PERSONAS: Array<{ match: string[]; persona: string; voice: string; style: string }> = [
  {
    match: ["football", "sports", "basketball", "soccer", "baseball", "hockey"],
    persona: "a fired-up head coach giving a halftime locker-room speech to the team",
    voice: "Algenib",
    style: "intense, motivating locker-room coach, loud, punchy and energetic",
  },
  {
    match: ["gaming", "minecraft", "fortnite", "video game", "esports"],
    persona: "a hype esports shoutcaster calling a championship match",
    voice: "Fenrir",
    style: "excited esports commentator, fast-paced and hyped",
  },
  {
    match: ["music", "rap", "hip hop", "band"],
    persona: "a laid-back music producer breaking it down in the studio",
    voice: "Puck",
    style: "cool, upbeat music producer, rhythmic and confident",
  },
  {
    match: ["movies", "movie", "film", "marvel"],
    persona: "an epic movie-trailer narrator",
    voice: "Gacrux",
    style: "deep, dramatic movie-trailer narrator with suspenseful pauses",
  },
  {
    match: ["cooking", "food", "baking", "chef"],
    persona: "a warm, passionate celebrity chef teaching in their kitchen",
    voice: "Sulafat",
    style: "warm, enthusiastic TV chef, inviting and expressive",
  },
  {
    match: ["anime", "manga"],
    persona: "a wise but playful anime sensei training their student",
    voice: "Sadachbia",
    style: "lively, dramatic anime mentor, earnest and encouraging",
  },
  {
    // The fantasy world's interest is "fantasy adventures, knights, and dragons" (interestFor in src/lib/adaptive.ts).
    match: ["fantasy", "wizard", "magic", "dragon", "knight"],
    persona: "a wise old wizard teaching an apprentice by candlelight in a tower full of spellbooks",
    voice: "Gacrux",
    style: "ancient, wise wizard: slow, warm and mysterious, with a twinkle of mischief and dramatic pauses",
  },
];

function pickPersona(interest: string) {
  const lower = interest.toLowerCase();
  return (
    PERSONAS.find((p) => p.match.some((m) => lower.includes(m))) ?? {
      persona: `an enthusiastic expert from the world of ${interest}`,
      voice: "Puck",
      style: "friendly, upbeat and enthusiastic teacher",
    }
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (err: unknown) => (err as { status?: number }).status;
const isBusy = (s?: number) => s === 503 || s === 429 || s === 500;

// ---------- Step 1: Muse writes the speech ----------
async function writeScript(topic: string, interest: string, facts: string[], persona: string) {
  // Shorter speech is faster to generate. One fact = one game concept, so keep it brief.
  const length =
    facts.length === 1 ? "70 to 110 words: about 30 seconds spoken" : "150 to 220 words: about one minute spoken";
  const prompt = `You are ${persona}. Explain this topic to a student, out loud, staying fully in character.

Topic: ${topic}
${facts.length ? `Facts you must cover accurately:\n${facts.join("\n")}\n` : ""}
Rules:
- Explain the topic through analogies from ${interest}. Keep every fact accurate.
- ${length}.
- This is a spoken script: no headings, lists, emojis, markdown, or stage directions in brackets.
- You may use the tag <short pause> two or three times for dramatic effect.
- End with a short, punchy line that sums up the key idea.`;

  const museKey = process.env.META_API_KEY ?? process.env.MUSE_API;
  if (museKey) {
    const muse = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: museKey });
    const reply = await muse.chat.completions.create({
      model: process.env.MUSE_MODEL ?? "muse-spark-1.1",
      messages: [{ role: "user", content: prompt }],
    });
    return reply.choices[0]?.message?.content?.trim() ?? "";
  }

  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const reply = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    contents: prompt,
  });
  return reply.text?.trim() ?? "";
}

// ---------- Step 2: Gemini performs it ----------
// Free-tier TTS allows only a few requests per day per model and key, and a refusal can take ~30 s to arrive.
// So a model+key that reports its daily limit is skipped for an hour instead of being retried on every voice.
const usedUpUntil = new Map<string, number>();
const isDailyLimit = (err: unknown) => statusOf(err) === 429 && /per ?day/i.test(String((err as Error).message));

async function speak(script: string, voice: string, style: string): Promise<string | null> {
  const keys = [...new Set([process.env.GEMINI_API_KEY, process.env.GEMINI_FALLBACK_API_KEY].filter((k): k is string => !!k))];
  const models = [
    process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts",
    process.env.GEMINI_TTS_FALLBACK ?? "gemini-3.8-flash-lite-tts",
  ];

  // Better model first, on either key, before dropping to the lite model.
  for (const model of models) for (const [k, apiKey] of keys.entries()) {
    const slot = `${model}#${k}`;
    if ((usedUpUntil.get(slot) ?? 0) > Date.now()) continue;
    const gemini = new GoogleGenAI({ apiKey });
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const interaction = await gemini.interactions.create({
          model,
          input: [
            {
              type: "user_input",
              content: [
                {
                  type: "text",
                  text: script,
                  annotations: [{ type: "speech_metadata", style }],
                },
              ],
            },
          ],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        });
        const data = interaction.output_audio?.data;
        if (data) return data; // base64 WAV, 24 kHz mono
      } catch (err) {
        if (isDailyLimit(err)) {
          console.warn(`Gemini TTS ${model} (${k ? "backup" : "main"} key) is out of daily quota; skipping it for an hour.`);
          usedUpUntil.set(slot, Date.now() + 60 * 60 * 1000);
          break;
        }
        console.warn(`Gemini TTS ${model} attempt ${attempt} failed (status ${statusOf(err)})`, err);
        if (!isBusy(statusOf(err))) break;
        await wait(1500);
      }
    }
  }
  return null; // the page falls back to the browser's voice
}

// ---------- Voices, shared between early starts and requests ----------
type Voice = { script: string; audioBase64: string | null; mimeType: string; persona: string };
const voices = new Map<string, Promise<Voice>>();
const VOICE_TTL_MS = 30 * 60 * 1000;

function makeVoice(topic: string, interest: string, facts: string[]): Promise<Voice> {
  const key = JSON.stringify({ topic, interest, facts });
  let voice = voices.get(key);
  if (!voice) {
    voice = (async () => {
      const p = pickPersona(interest);
      const script = await writeScript(topic, interest, facts, p.persona);
      if (!script) throw new Error("Empty script");
      const audioBase64 = await speak(script, p.voice, p.style);
      return { script, audioBase64, mimeType: "audio/wav", persona: p.persona };
    })();
    voices.set(key, voice);
    voice.then(
      // Keep a finished voice a while for the browser to fetch; drop one without audio so a later request retries TTS.
      (v) => (v.audioBase64 ? setTimeout(() => voices.delete(key), VOICE_TTL_MS).unref() : voices.delete(key)),
      () => voices.delete(key),
    );
  }
  return voice;
}

// ---------- Encounter dialogue: the character speaks the exact line on screen ----------
// No script to write: Gemini TTS performs the given text in the theme's character voice.
type SpokenLine = { audioBase64: string; mimeType: string };
const spokenLines = new Map<string, Promise<SpokenLine>>();

export function speakLine(text: string, interest: string): Promise<SpokenLine> {
  const p = pickPersona(interest);
  const key = JSON.stringify({ text, voice: p.voice, style: p.style });
  let line = spokenLines.get(key);
  if (!line) {
    line = speak(text, p.voice, p.style).then((audioBase64) => {
      if (!audioBase64) throw new Error("No speech audio.");
      return { audioBase64, mimeType: "audio/wav" };
    });
    spokenLines.set(key, line);
    line.then(
      () => setTimeout(() => spokenLines.delete(key), VOICE_TTL_MS).unref(),
      () => spokenLines.delete(key), // let a later request retry
    );
  }
  return line;
}

// Early starts run two at a time (like the browser's prefetch) to stay under Gemini TTS per-minute limits.
const warmQueue: (() => Promise<unknown>)[] = [];
let warming = 0;
function drainWarmQueue() {
  while (warming < 2 && warmQueue.length) {
    warming++;
    warmQueue.shift()!().finally(() => {
      warming--;
      drainWarmQueue();
    });
  }
}

// A concept's lesson lines as the dialogue box shows them. Must match getLessonLines in
// src/lib/characters.ts word for word (tests/adaptive-game.test.ts checks), or the browser's request
// misses the lines voiced early and voices them again.
export const lessonLines = (c: { name: string; analogy: string; lesson: string }) => [
  `${c.name}. Think of it as ${c.analogy}.`,
  c.lesson,
];

// Speaks a concept's lesson lines before the browser asks for them; server.ts calls this for the first
// concept while the game is still generating (the first enemy teaches it).
export function warmLessonLines(interest: string, c: { name: string; analogy: string; lesson: string }) {
  for (const text of lessonLines(c)) warmQueue.push(() => speakLine(text, interest).catch(() => {}));
  drainWarmQueue();
}

// ---------- Route ----------
export function registerCoachRoute(app: Express) {
  app.post("/api/coach", async (req, res) => {
    const { topic, interest, facts } = req.body as { topic?: string; interest?: string; facts?: string[] };
    if (!topic?.trim() || !interest?.trim()) {
      res.status(400).json({ error: "Need a topic and an interest." });
      return;
    }
    if (facts !== undefined && !(Array.isArray(facts) && facts.every((f) => typeof f === "string"))) {
      res.status(400).json({ error: "Facts must be a list of strings." });
      return;
    }

    try {
      res.json(await makeVoice(topic, interest, facts ?? []));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't make the voice explanation. Please try again." });
    }
  });

  // One dialogue line, spoken as written (encounters; see speakLine).
  app.post("/api/speak", async (req, res) => {
    const { text, interest } = req.body as { text?: unknown; interest?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > 1500 || typeof interest !== "string" || !interest.trim()) {
      res.status(400).json({ error: "Need a line of text (up to 1500 characters) and an interest." });
      return;
    }
    try {
      res.json(await speakLine(text, interest));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't voice that line." });
    }
  });
}