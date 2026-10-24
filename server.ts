// Backend: keeps keys safe, talks to Meta Muse and Tiger Data, serves the built site.
// Dev:  npx tsx watch server.ts
import express from "express";
import path from "node:path";
import pg from "pg";
import { gameRouter } from "./game-routes.ts";
import { generateText, parseJsonLoose, LlmError } from "./llm.ts";

process.loadEnvFile();

const app = express();

// Battle mode. Mounted BEFORE express.json() because it brings its own JSON parser.
app.use("/api/game", gameRouter);

app.use(express.json());

// ---- Tiger Data ----
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split("?")[0],
  ssl: { rejectUnauthorized: false },
});

// ---- Model: Meta Muse (see llm.ts) ----

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

// ---- Serve the built React site (after `npm run build`) ----
app.use(express.static(path.resolve("dist")));
app.use((_req, res) => {
  res.sendFile(path.resolve("dist", "index.html"));
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));