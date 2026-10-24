// Battle-mode game API.
//
// Mount it in server.ts with two lines:
//
//   import { gameRouter } from "./game-routes.ts";
//   app.use("/api/game", gameRouter); // put this ABOVE your own app.use(express.json())
//
// (It has its own JSON parser, so mounting it first is what keeps req.body parsed.)
//
// Design notes
// - One model call (see llm.ts) per game builds a "pack": subtopics, themed enemies, a boss, and a
//   question bank. After that the game runs with no AI latency.
// - The server owns all game state and the answer key. The browser never sees correct
//   answers until it has answered, so it can't cheat, and the same endpoints will work
//   for multiplayer: a game already holds a `players` map and every call names a playerId.

import express, { Router } from "express";
import type { Request, Response } from "express";
import { generateText, parseJsonLoose, LlmError } from "./llm.ts";
import { randomUUID } from "node:crypto";

// ---------- Settings ----------
const MAX_LIVES = 3;
const ENCOUNTERS_BEFORE_BOSS = 6;
const QUESTIONS_PER_SUBTOPIC = 3;
const GAME_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_ACCENT = "#8b7cf6";


// ---------- Types ----------
type Question = {
  id: string;
  subtopic: string; // subtopic id
  prompt: string;
  options: string[];
  answer: number; // index into options (server-side only until answered)
  explanation: string;
};
type Enemy = { name: string; emoji: string; taunt: string };
type Subtopic = { id: string; name: string; enemy: Enemy };
type Boss = { name: string; emoji: string; intro: string };
type Pack = { title: string; accent: string; boss: Boss; subtopics: Subtopic[]; questions: Question[] };

type Phase = "battle" | "boss_ready" | "game_over";
type SubtopicStats = { attempts: number; correct: number };
type Player = {
  id: string;
  name: string;
  lives: number;
  phase: Phase;
  completed: number; // encounters answered
  defeated: number; // enemies beaten (correct answers)
  trail: boolean[]; // one entry per answered encounter: true = won
  proficiency: Record<string, SubtopicStats>; // keyed by subtopic id
  used: string[]; // question ids already asked
  current: { questionId: string } | null;
};
type Game = {
  id: string;
  mode: "solo" | "multiplayer"; // only "solo" is implemented
  createdAt: number;
  pack: Pack;
  players: Record<string, Player>;
};
type StartInput = {
  topic: string;
  interest: string;
  level: string;
  material: string;
  playerName: string;
};

const games = new Map<string, Game>();

// ---------- Small helpers ----------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
// ---------- Model: build the game pack ----------
function buildPackPrompt(i: StartInput): string {
  const hasMaterial = Boolean(i.material);
  return `You are designing a quiz-battle game that teaches real material through a theme the player loves.

Player's theme: ${i.interest}
Reading level: ${i.level}
Subject: ${i.topic || "(see the study material)"}
${i.material ? `Study material (text):\n"""\n${i.material}\n"""` : ""}

Rules:
- ${hasMaterial ? "Base every subtopic and question ONLY on the study material." : "Use well-established, accurate facts about the subject."}
- Split the subject into 4 to 6 distinct subtopics.
- For each subtopic, invent an enemy themed on "${i.interest}": a short name, one emoji, and a one-line taunt.
- For each subtopic, write exactly ${QUESTIONS_PER_SUBTOPIC} multiple-choice questions with 4 options each.
- Questions must test the real subject. Theme flavor may color the wording, but the player must need the subject knowledge to answer. Never ask about the theme itself.
- Exactly one option is correct; the distractors should be plausible. "answer" is the zero-based index of the correct option.
- "explanation" is 1 to 2 sentences on why the correct option is right.
- "boss" is a final boss in the same theme: name, emoji, and one dramatic sentence of intro.
- "accent" is one bright, saturated hex color that suits the theme and reads well on a near-black background.

Return ONLY JSON in exactly this shape, with no markdown fences:
{
  "title": "short game title",
  "accent": "#RRGGBB",
  "boss": { "name": "", "emoji": "", "intro": "" },
  "subtopics": [
    {
      "name": "",
      "enemy": { "name": "", "emoji": "", "taunt": "" },
      "questions": [
        { "prompt": "", "options": ["", "", "", ""], "answer": 0, "explanation": "" }
      ]
    }
  ]
}`;
}

function accentOrDefault(v: unknown): string {
  const s = str(v);
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return DEFAULT_ACCENT;
  const r = parseInt(s.slice(1, 3), 16);
  const g = parseInt(s.slice(3, 5), 16);
  const b = parseInt(s.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.35 ? DEFAULT_ACCENT : s; // too dark to show on the dark stage
}

function normalizeQuestion(raw: unknown, subtopicId: string, id: string): Question | null {
  if (!isRecord(raw)) return null;
  const prompt = str(raw.prompt);
  const options = Array.isArray(raw.options) ? raw.options.map((o) => str(o)).filter(Boolean).slice(0, 4) : [];
  const answer = typeof raw.answer === "number" ? Math.trunc(raw.answer) : -1;
  if (!prompt || options.length < 3 || answer < 0 || answer >= options.length) return null;

  // Models like to put the right answer first. Shuffle and remap so it isn't predictable.
  const order = shuffle(options.map((_, i) => i));
  return {
    id,
    subtopic: subtopicId,
    prompt,
    options: order.map((i) => options[i]),
    answer: order.indexOf(answer),
    explanation: str(raw.explanation, "That's the answer supported by the material."),
  };
}

function normalizePack(raw: unknown): Pack {
  if (!isRecord(raw)) throw new Error("The AI returned an unexpected format.");
  const subtopics: Subtopic[] = [];
  const questions: Question[] = [];

  const rawSubtopics = Array.isArray(raw.subtopics) ? raw.subtopics : [];
  for (const s of rawSubtopics) {
    if (!isRecord(s) || subtopics.length >= 6) continue;
    const name = str(s.name);
    if (!name) continue;
    const id = `s${subtopics.length}`;
    const rawQuestions = Array.isArray(s.questions) ? s.questions : [];
    const valid = rawQuestions
      .map((q, i) => normalizeQuestion(q, id, `${id}q${i}`))
      .filter((q): q is Question => q !== null);
    if (valid.length === 0) continue;

    const e = isRecord(s.enemy) ? s.enemy : {};
    subtopics.push({
      id,
      name,
      enemy: {
        name: str(e.name, `${name} Guardian`),
        emoji: str(e.emoji, "👾").slice(0, 8),
        taunt: str(e.taunt, "You shall not pass!"),
      },
    });
    questions.push(...valid);
  }
  if (subtopics.length < 2) throw new Error("The AI didn't return enough subtopics. Try again.");

  const b = isRecord(raw.boss) ? raw.boss : {};
  return {
    title: str(raw.title, "Battle Mode"),
    accent: accentOrDefault(raw.accent),
    boss: {
      name: str(b.name, "The Final Boss"),
      emoji: str(b.emoji, "👹").slice(0, 8),
      intro: str(b.intro, "Everything you've learned comes down to this."),
    },
    subtopics,
    questions,
  };
}

async function generatePack(input: StartInput): Promise<Pack> {
  // API errors (bad key, rate limit) throw an LlmError straight away and are not retried.
  // Only a malformed answer is worth a second try.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateText(buildPackPrompt(input));
    try {
      return normalizePack(parseJsonLoose(text));
    } catch (e) {
      lastError = e;
    }
  }
  console.error("Couldn't parse the game pack:", lastError);
  throw new LlmError("The AI's answer wasn't in the right format. Try again.");
}

// ---------- Game logic ----------
function newPlayer(pack: Pack, id: string, name: string): Player {
  const proficiency: Record<string, SubtopicStats> = {};
  for (const s of pack.subtopics) proficiency[s.id] = { attempts: 0, correct: 0 };
  return { id, name, lives: MAX_LIVES, phase: "battle", completed: 0, defeated: 0, trail: [], proficiency, used: [], current: null };
}

// Laplace-smoothed so one lucky/unlucky answer doesn't swing the score to 0% or 100%.
function proficiencyScore(s: SubtopicStats): number {
  return (s.correct + 1) / (s.attempts + 2);
}

function buildReport(game: Game, player: Player) {
  return game.pack.subtopics.map((s) => {
    const stats = player.proficiency[s.id];
    return {
      id: s.id,
      name: s.name,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: stats.attempts > 0 ? stats.correct / stats.attempts : null,
      score: proficiencyScore(stats),
    };
  });
}

// The boss battle will build its questions from this. Subtopics the player was actually
// quizzed on win out over untested ones.
export function weakestSubtopic(game: Game, player: Player) {
  const report = buildReport(game, player);
  const tested = report.filter((r) => r.attempts > 0);
  const pool = tested.length > 0 ? tested : report;
  return pool.reduce((worst, r) => (r.score < worst.score ? r : worst), pool[0]);
}

function playerView(game: Game, player: Player) {
  return {
    playerId: player.id,
    name: player.name,
    lives: player.lives,
    maxLives: MAX_LIVES,
    completed: player.completed,
    total: ENCOUNTERS_BEFORE_BOSS,
    defeated: player.defeated,
    trail: player.trail,
    phase: player.phase,
    report: buildReport(game, player),
    weakest: player.phase === "battle" ? null : weakestSubtopic(game, player),
  };
}

function publicPack(pack: Pack) {
  return {
    title: pack.title,
    accent: pack.accent,
    boss: pack.boss,
    subtopics: pack.subtopics.map((s) => ({ id: s.id, name: s.name })),
  };
}

function encounterFor(game: Game, player: Player, question: Question) {
  const sub = game.pack.subtopics.find((s) => s.id === question.subtopic)!;
  return {
    number: player.completed + 1,
    enemy: { ...sub.enemy, subtopic: sub.name },
    question: { id: question.id, prompt: question.prompt, options: question.options }, // no answer key
  };
}

// Cover every subtopic evenly: fight the least-tested subtopic next, then a fresh question from it.
function chooseQuestion(game: Game, player: Player): Question {
  const fewest = Math.min(...game.pack.subtopics.map((s) => player.proficiency[s.id].attempts));
  const sub = pick(game.pack.subtopics.filter((s) => player.proficiency[s.id].attempts === fewest));
  const all = game.pack.questions.filter((q) => q.subtopic === sub.id);
  const fresh = all.filter((q) => !player.used.includes(q.id));
  return pick(fresh.length > 0 ? fresh : all);
}

function lookup(req: Request, res: Response): { game: Game; player: Player } | null {
  const game = games.get(String(req.params.gameId));
  const body = isRecord(req.body) ? req.body : {};
  const player = game?.players[str(body.playerId)];
  if (!game || !player) {
    res.status(404).json({ error: "Game not found. It may have expired, so start a new one." });
    return null;
  }
  return { game, player };
}

// ---------- Routes ----------
export const gameRouter = Router();
gameRouter.use(express.json({ limit: "1mb" }));

// Build a new game (one model call) and add the first player.
gameRouter.post("/start", async (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const input: StartInput = {
    topic: str(body.topic).slice(0, 4000),
    interest: str(body.interest).slice(0, 200),
    level: str(body.level, "high school").slice(0, 50),
    material: str(body.material).slice(0, 40000),
    playerName: str(body.playerName, "Player").slice(0, 40),
  };
  if (!input.interest) {
    res.status(400).json({ error: "Tell us what you're into so the game has a theme." });
    return;
  }
  if (Array.isArray(body.pdfs) && body.pdfs.length > 0) {
    res.status(400).json({ error: "PDFs aren't supported yet. Paste the text or use a .txt or .md file." });
    return;
  }
  if (!input.topic && !input.material) {
    res.status(400).json({ error: "Add a topic or upload notes first." });
    return;
  }

  // Drop stale games so memory doesn't grow forever.
  const now = Date.now();
  for (const [id, g] of games) if (now - g.createdAt > GAME_TTL_MS) games.delete(id);

  try {
    const pack = await generatePack(input);
    const player = newPlayer(pack, randomUUID(), input.playerName);
    const game: Game = { id: randomUUID(), mode: "solo", createdAt: now, pack, players: { [player.id]: player } };
    games.set(game.id, game);
    res.json({ gameId: game.id, playerId: player.id, pack: publicPack(pack), state: playerView(game, player) });
  } catch (e) {
    console.error("game start failed:", e);
    res.status(500).json({ error: e instanceof LlmError ? e.message : "Couldn't build the game. Try again." });
  }
});

// Get the current enemy and question. Safe to call again: it returns the same unanswered one.
gameRouter.post("/:gameId/next", (req, res) => {
  const ctx = lookup(req, res);
  if (!ctx) return;
  const { game, player } = ctx;

  if (player.phase !== "battle") {
    res.json({ encounter: null, state: playerView(game, player) });
    return;
  }
  let question = player.current && game.pack.questions.find((q) => q.id === player.current!.questionId);
  if (!question) {
    question = chooseQuestion(game, player);
    player.current = { questionId: question.id };
  }
  res.json({ encounter: encounterFor(game, player, question), state: playerView(game, player) });
});

// Answer the current question. Updates lives and per-subtopic proficiency.
gameRouter.post("/:gameId/answer", (req, res) => {
  const ctx = lookup(req, res);
  if (!ctx) return;
  const { game, player } = ctx;
  const body = isRecord(req.body) ? req.body : {};

  const question = player.current && game.pack.questions.find((q) => q.id === player.current!.questionId);
  if (player.phase !== "battle" || !question) {
    res.status(400).json({ error: "There's no active question." });
    return;
  }
  const choice = typeof body.choice === "number" ? Math.trunc(body.choice) : -1;
  if (choice < 0 || choice >= question.options.length) {
    res.status(400).json({ error: "Pick one of the options." });
    return;
  }

  const correct = choice === question.answer;
  const stats = player.proficiency[question.subtopic];
  stats.attempts += 1;
  if (correct) stats.correct += 1;

  player.used.push(question.id);
  player.current = null;
  player.completed += 1;
  player.trail.push(correct);
  if (correct) player.defeated += 1;
  else player.lives -= 1;

  if (player.lives <= 0) player.phase = "game_over";
  else if (player.completed >= ENCOUNTERS_BEFORE_BOSS) player.phase = "boss_ready";

  res.json({
    correct,
    correctIndex: question.answer,
    explanation: question.explanation,
    state: playerView(game, player),
  });
});

// Replay with the same pack (no new model call). Resets lives and proficiency.
gameRouter.post("/:gameId/restart", (req, res) => {
  const ctx = lookup(req, res);
  if (!ctx) return;
  const { game, player } = ctx;
  game.players[player.id] = newPlayer(game.pack, player.id, player.name);
  res.json({ state: playerView(game, game.players[player.id]) });
});

// TODO (boss battle): add POST /:gameId/boss/start here. Call weakestSubtopic(game, player) and ask
// the model for fresh questions on that subtopic only.
// TODO (multiplayer): add POST /:gameId/join to add entries to game.players and set game.mode.
