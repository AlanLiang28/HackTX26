// The backend: keeps your secret keys safe and talks to Tiger Data and Gemini.
// Run with:  npx tsx watch server.ts
import express from "express";
import path from "node:path";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";

process.loadEnvFile(); // reads .env into process.env

const app = express();
app.use(express.json());

// ---- Tiger Data (Postgres) connection ----
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split("?")[0],
  ssl: { rejectUnauthorized: false }, // fine for a hackathon; avoids the certificate error
});

// ---- Gemini ----
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

// Get the latest entries
app.get("/api/entries", async (_req, res) => {
  const result = await db.query(
    "SELECT created_at, mood, note FROM entries ORDER BY created_at DESC LIMIT 50"
  );
  res.json(result.rows);
});

// Save a new entry
app.post("/api/entries", async (req, res) => {
  const { mood, note } = req.body as { mood: number; note: string };
  if (!mood || mood < 1 || mood > 5) {
    res.status(400).json({ error: "Mood must be 1 to 5" });
    return;
  }
  await db.query("INSERT INTO entries (mood, note) VALUES ($1, $2)", [mood, note ?? ""]);
  res.json({ ok: true });
});

// Average mood per day, using Tiger Data's time_bucket (a time-series feature)
app.get("/api/trend", async (_req, res) => {
  const result = await db.query(`
    SELECT time_bucket('1 day', created_at) AS day, ROUND(AVG(mood), 1) AS avg_mood
    FROM entries
    WHERE created_at > NOW() - INTERVAL '14 days'
    GROUP BY day
    ORDER BY day
  `);
  res.json(result.rows);
});

// Ask Gemini to find patterns in recent entries
app.get("/api/insights", async (_req, res) => {
  const result = await db.query(
    "SELECT created_at, mood, note FROM entries ORDER BY created_at DESC LIMIT 30"
  );
  if (result.rows.length === 0) {
    res.json({ insight: "Add a few entries first, then ask again." });
    return;
  }

  const log = result.rows
    .map((r) => `${new Date(r.created_at).toLocaleString()} | mood ${r.mood}/5 | ${r.note}`)
    .join("\n");

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents:
        "Here is someone's mood journal (1 = bad, 5 = great). " +
        "In 3 short bullet points, describe any patterns you notice and give one kind, practical suggestion.\n\n" +
        log,
    });
    res.json({ insight: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ insight: "Gemini request failed. Check the server terminal for the error." });
  }
});

// ---- Serve the built React website (after `npm run build`) ----
// On Vultr, this lets one program run both the website and the API.
app.use(express.static(path.resolve("dist")));
app.use((_req, res) => {
  res.sendFile(path.resolve("dist", "index.html"));
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));