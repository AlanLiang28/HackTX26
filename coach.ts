// AI voice explanation: Muse writes a script in character, Gemini TTS performs it.
// Add to server.ts:   import { registerCoachRoute } from "./coach";
//                     registerCoachRoute(app);      (after app.use(express.json(...)))
import type { Express } from "express";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

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
async function writeScript(topic: string, interest: string, facts: string, persona: string) {
  const muse = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MUSE_API });

  const reply = await muse.chat.completions.create({
    model: process.env.MUSE_MODEL ?? "muse-spark-1.1",
    messages: [
      {
        role: "user",
        content: `You are ${persona}. Explain this topic to a student, out loud, staying fully in character.

Topic: ${topic}
${facts ? `Facts you must cover accurately:\n${facts}\n` : ""}
Rules:
- Explain the topic through analogies from ${interest}. Keep every fact accurate.
- 150 to 220 words: about one minute spoken.
- This is a spoken script: no headings, lists, emojis, markdown, or stage directions in brackets.
- You may use the tag <short pause> two or three times for dramatic effect.
- End with a short, punchy line that sums up the key idea.`,
      },
    ],
  });

  return reply.choices[0]?.message?.content?.trim() ?? "";
}

// ---------- Step 2: Gemini performs it ----------
async function speak(script: string, voice: string, style: string): Promise<string | null> {
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = [
    process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts",
    process.env.GEMINI_TTS_FALLBACK ?? "gemini-3.8-flash-lite-tts",
  ];

  for (const model of models) {
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
        console.warn(`Gemini TTS ${model} attempt ${attempt} failed (status ${statusOf(err)})`, err);
        if (!isBusy(statusOf(err))) break;
        await wait(1500);
      }
    }
  }
  return null; // the page falls back to the browser's voice
}

// ---------- Route ----------
export function registerCoachRoute(app: Express) {
  app.post("/api/coach", async (req, res) => {
    const { topic, interest, facts } = req.body as { topic?: string; interest?: string; facts?: string[] };
    if (!topic?.trim() || !interest?.trim()) {
      res.status(400).json({ error: "Need a topic and an interest." });
      return;
    }

    const p = pickPersona(interest);
    try {
      const script = await writeScript(topic, interest, (facts ?? []).join("\n"), p.persona);
      if (!script) throw new Error("Empty script");
      const audioBase64 = await speak(script, p.voice, p.style);
      res.json({ script, audioBase64, mimeType: "audio/wav", persona: p.persona });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't make the voice explanation. Please try again." });
    }
  });
}