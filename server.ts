// Backend: keeps keys safe, talks to Gemini and Tiger Data, serves the built site.
// Dev:  npx tsx watch server.ts
import express from "express";
import path from "node:path";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { registerCoachRoute, warmConceptVoice } from "./coach.ts";
import rateLimit from "express-rate-limit";
import { gameRouter, onPackConcept } from "./game-routes.ts";
import { generateText, parseJsonLoose, LlmError } from "./llm.ts";
import { bossRouter } from "./boss.ts";
import { classRouter } from "./classes.ts";

process.loadEnvFile();

const app = express();

// ---- Abuse protection for the AI routes ----
// Registered before the game router so /api/game/start is limited too.
app.set("trust proxy", 1); // we're behind Caddy, so read the visitor's real IP

// Only game/start calls the model; next/answer/restart are cheap and stay unlimited.
// Same for the boss fight: only attempt (transcribe + grade) calls the model.
const AI_ROUTES = [
  "/api/explain",
  "/api/sessions",
  "/api/game/start",
  "/api/sessions/:code/boss/attempt",
  "/api/classes", // creating a class builds its two game packs; class plays reuse them, so they stay unlimited
  "/api/free-agents", // signing up builds the free agent's pack
];

// Voice explanations have their own, looser limits: the game makes one per concept
// ahead of time (about 4-6 per game), which would blow through the general limit.
const VOICE_ROUTES = ["/api/coach"];

// Whole site: hard cap on calls per day, so costs can't run away
function dailyBudget(max: number) {
  let callsToday = 0;
  let currentDay = new Date().toDateString();
  return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    const today = new Date().toDateString();
    if (today !== currentDay) {
      currentDay = today;
      callsToday = 0;
    }
    if (callsToday >= max) {
      res.status(503).json({ error: "The app hit its daily AI budget. Try again tomorrow." });
      return;
    }
    callsToday++;
    next();
  };
}

// Per visitor: 5 AI requests per minute, 40 per day; site-wide 300 per day
app.post(
  AI_ROUTES,
  rateLimit({ windowMs: 60 * 1000, limit: 5, message: { error: "Slow down! Wait a minute and try again." } }),
  rateLimit({ windowMs: 24 * 60 * 60 * 1000, limit: 40, message: { error: "You've hit today's limit. Come back tomorrow!" } }),
  dailyBudget(300),
);

// Per visitor: 12 voices per minute, 100 per day; site-wide 1000 per day
app.post(
  VOICE_ROUTES,
  rateLimit({ windowMs: 60 * 1000, limit: 12, message: { error: "Slow down! Wait a minute and try again." } }),
  rateLimit({ windowMs: 24 * 60 * 60 * 1000, limit: 100, message: { error: "You've hit today's voice limit. Come back tomorrow!" } }),
  dailyBudget(1000),
);

// Battle mode. Mounted BEFORE express.json() because it brings its own JSON parser.
app.use("/api/game", gameRouter);
// Start each concept's voice while the game is still generating, so the first enemy's voice is ready sooner.
onPackConcept(warmConceptVoice);

app.use(express.json());
registerCoachRoute(app);

// ---- Tiger Data ----
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split("?")[0],
  ssl: { rejectUnauthorized: false },
});

// ---- Model: Gemini (see llm.ts) ----
// Classes (classes.ts) use this client directly for embeddings; text calls go through llm.ts.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ---- Boss fight models (boss.ts) ----
// Muse (Meta) handles voice transcription only; null without a key, so transcription falls back to Gemini.
const muse = process.env.META_API_KEY
  ? new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: "https://api.meta.ai/v1" })
  : null;

function buildPrompt(topic: string, interest: string, level: string) {
  return `You are a friendly tutor who explains things using analogies from the student's interests.

Topic to learn: ${topic}
Student's interest: ${interest}
Student's level: ${level}

Explain the topic entirely through analogies to ${interest}. Map each key part of the topic to something
specific from ${interest} (for example, if the topic is cells and the interest is football, the nucleus
could be the quarterback calling the plays). Keep the science/facts accurate; the analogy is the vehicle.

Return ONLY JSON in exactly this shape:
{
  "title": "short catchy title",
  "overview": "2-3 sentences giving the big-picture analogy",
  "mappings": [
    { "concept": "a key part of the topic", "analogy": "what it is in ${interest}", "explanation": "1-2 sentences on why they match" }
  ],
  "summary": "2 sentences tying it together",
  "quiz": [
    { "question": "question that checks understanding of the real topic", "options": ["a", "b", "c", "d"], "answer": 0 }
  ]
}
Include 4 to 6 mappings and exactly 3 quiz questions. "answer" is the index (0-3) of the correct option.`;
}

// Generate an explanation, save it, return it
app.post("/api/explain", async (req, res) => {
  const { topic, interest, level } = req.body as { topic?: string; interest?: string; level?: string };
  if (!topic?.trim() || !interest?.trim()) {
    res.status(400).json({ error: "Please enter both a topic and an interest." });
    return;
  }
  const lvl = level || "high school";

  try {
    const content = parseJsonLoose(await generateText(buildPrompt(topic, interest, lvl)));

    await db.query(
      "INSERT INTO explanations (topic, interest, level, content) VALUES ($1, $2, $3, $4)",
      [topic, interest, lvl, content]
    );

    res.json({ topic, interest, level: lvl, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof LlmError ? err.message : "Something went wrong generating the explanation. Try again.",
    });
  }
});

// Recent study sessions
app.get("/api/history", async (_req, res) => {
  const result = await db.query(
    "SELECT created_at, topic, interest, level, content FROM explanations ORDER BY created_at DESC LIMIT 20"
  );
  res.json(result.rows);
});

// Sessions per day for the last 7 days (Tiger Data time_bucket)
app.get("/api/stats", async (_req, res) => {
  const result = await db.query(`
    SELECT time_bucket('1 day', created_at) AS day, COUNT(*)::int AS sessions
    FROM explanations
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY day
    ORDER BY day
  `);
  res.json(result.rows);
});

// ---- Part 3: boss fight (must stay above the static site + catch-all) ----
app.use(bossRouter({ db, muse }));
app.use(classRouter({ db, ai })); // classes, free agents + matching; groups play the boss above (docs/classes.md)

// ---- Serve the built React site (after `npm run build`) ----
app.use(express.static(path.resolve("dist")));
app.use((_req, res) => {
  res.sendFile(path.resolve("dist", "index.html"));
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));