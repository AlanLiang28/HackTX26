import type { StudySession, Theme } from "./study";

export type Proficiency = {
  id: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
  score: number;
};
export type GameState = {
  playerId: string;
  name: string;
  lives: number;
  maxLives: number;
  completed: number;
  total: number;
  defeated: number;
  trail: boolean[];
  phase: "battle" | "boss_ready" | "game_over";
  report: Proficiency[];
  weakest: Proficiency | null;
};
export type AdaptivePack = {
  title: string;
  overview: string;
  summary: string;
  limitation: string;
  subtopics: { id: string; name: string; lesson: string; analogy: string }[];
};
export type AdaptiveGame = {
  gameId: string;
  playerId: string;
  pack: AdaptivePack;
  state: GameState;
};
export type RemoteEncounter = {
  number: number;
  enemy: { name: string; taunt: string; subtopic: string };
  question: {
    id: string;
    subtopicId: string;
    prompt: string;
    options: string[];
  };
};
export type GradedAnswer = {
  questionId: string;
  choice: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
  state: GameState;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validState(value: unknown): value is GameState {
  return (
    record(value) &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    Number.isInteger(value.lives) &&
    Number.isInteger(value.maxLives) &&
    Number(value.maxLives) > 0 &&
    Number(value.lives) >= 0 &&
    Number(value.lives) <= Number(value.maxLives) &&
    Number.isInteger(value.completed) &&
    Number.isInteger(value.total) &&
    Number(value.total) > 0 &&
    Number(value.completed) >= 0 &&
    Number(value.completed) <= Number(value.total) &&
    Number.isInteger(value.defeated) &&
    ["battle", "boss_ready", "game_over"].includes(String(value.phase)) &&
    Array.isArray(value.trail) &&
    value.trail.every((item) => typeof item === "boolean") &&
    Array.isArray(value.report) &&
    value.report.every(
      (item) =>
        record(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.score === "number" &&
        typeof item.attempts === "number" &&
        typeof item.correct === "number",
    ) &&
    (value.weakest === null ||
      (record(value.weakest) && typeof value.weakest.name === "string"))
  );
}
async function post(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      record(data) && typeof data.message === "string"
        ? data.message
        : record(data) && typeof data.error === "string"
          ? data.error
          : "Could not connect to the game. Please try again.",
    );
  return data;
}
// Shared with CoachVoice so the voice coach matches the game's analogies.
export function interestFor(theme: Theme) {
  return {
    sports: "American football",
    fantasy: "fantasy adventures, knights, and dragons",
    gossip:
      "middle school gossip: hallway rumors, lunch-table drama, group chats, and friendship feuds (kind and school-appropriate, no real names or cruelty)",
  }[theme];
}

export async function startAdaptiveGame(
  notes: string,
  theme: Theme,
  signal: AbortSignal,
): Promise<AdaptiveGame> {
  const data = await post(
    "/api/game/start",
    {
      material: notes,
      interest: interestFor(theme),
      level: "high school",
      playerName: "You",
    },
    signal,
  );
  return parseAdaptiveGame(data);
}
export function parseAdaptiveGame(data: unknown): AdaptiveGame {
  if (
    !record(data) ||
    typeof data.gameId !== "string" ||
    typeof data.playerId !== "string" ||
    !record(data.pack) ||
    !validState(data.state)
  )
    throw new Error("The game response was incomplete. Please try again.");
  const pack = data.pack;
  if (
    typeof pack.title !== "string" ||
    typeof pack.overview !== "string" ||
    typeof pack.summary !== "string" ||
    typeof pack.limitation !== "string" ||
    !Array.isArray(pack.subtopics) ||
    !pack.subtopics.length ||
    !pack.subtopics.every(
      (sub) =>
        record(sub) &&
        typeof sub.id === "string" &&
        typeof sub.name === "string" &&
        typeof sub.lesson === "string" &&
        typeof sub.analogy === "string",
    )
  )
    throw new Error("The game lessons were incomplete. Please try again.");
  return data as unknown as AdaptiveGame;
}
export async function nextAdaptiveEncounter(
  game: AdaptiveGame,
): Promise<{ encounter: RemoteEncounter | null; state: GameState }> {
  const data = await post(`/api/game/${game.gameId}/next`, {
    playerId: game.playerId,
  });
  if (!record(data) || !validState(data.state))
    throw new Error("The next encounter was incomplete. Please try again.");
  const encounter = data.encounter;
  if (
    encounter !== null &&
    (!record(encounter) ||
      !record(encounter.enemy) ||
      typeof encounter.enemy.subtopic !== "string" ||
      !record(encounter.question) ||
      typeof encounter.question.id !== "string" ||
      typeof encounter.question.subtopicId !== "string" ||
      typeof encounter.question.prompt !== "string" ||
      !Array.isArray(encounter.question.options) ||
      encounter.question.options.length < 2 ||
      !encounter.question.options.every((option) => typeof option === "string"))
  )
    throw new Error("The next question was incomplete. Please try again.");
  return data as unknown as {
    encounter: RemoteEncounter | null;
    state: GameState;
  };
}
export async function gradeAdaptiveAnswer(
  game: AdaptiveGame,
  encounter: RemoteEncounter,
  choice: number,
): Promise<GradedAnswer> {
  const data = await post(`/api/game/${game.gameId}/answer`, {
    playerId: game.playerId,
    questionId: encounter.question.id,
    choice,
  });
  if (
    !record(data) ||
    !validState(data.state) ||
    typeof data.correct !== "boolean" ||
    !Number.isInteger(data.correctIndex) ||
    Number(data.correctIndex) < 0 ||
    Number(data.correctIndex) >= encounter.question.options.length ||
    !Number.isInteger(data.choice) ||
    typeof data.explanation !== "string" ||
    data.questionId !== encounter.question.id
  )
    throw new Error("The answer feedback was incomplete. Please try again.");
  return data as unknown as GradedAnswer;
}
export async function restartAdaptiveGame(
  game: AdaptiveGame,
): Promise<GameState> {
  const data = await post(`/api/game/${game.gameId}/restart`, {
    playerId: game.playerId,
  });
  if (!record(data) || !validState(data.state))
    throw new Error("The game could not restart. Please try again.");
  return data.state;
}
export function adaptiveStudySession(
  game: AdaptiveGame,
  notes: string,
  theme: Theme,
): StudySession {
  return {
    topic: notes,
    interest: theme,
    level: "high school",
    content: {
      title: game.pack.title,
      overview: game.pack.overview,
      summary: game.pack.summary,
      limitation: game.pack.limitation,
      mappings: game.pack.subtopics.map((sub) => ({
        concept: sub.name,
        analogy: sub.analogy,
        explanation: sub.lesson,
      })),
      // These slots describe the trail. Live questions arrive from /next; answer keys
      // stay on the server and are filled in only after that question was graded.
      quiz: Array.from({ length: game.state.total }, () => ({
        question: "Your next question will adapt to your progress.",
        options: [],
        answer: -1,
      })),
    },
  };
}
