import { api } from "./classroom";
export type BossState = {
  status: "not_started" | "active" | "defeated";
  teamAverage: number;
  teamThreshold: number;
  players: { id: string; name: string }[];
  turn: {
    playerId: string;
    playerName: string;
    concept: { name: string; analogy: string };
    attempt: number;
    reason: "unpassed" | "rally";
  } | null;
  progress: {
    playerId: string;
    concept: string;
    passed: boolean;
    bestTotal: number;
    attempts: number;
  }[];
  lastAttempt: {
    playerId: string;
    playerName: string;
    concept: string;
    transcript: string;
    total: number;
    passed: boolean;
    feedback: string;
    missedPoints: string[];
    createdAt: string;
  } | null;
};
export type BossGrade = {
  transcript: string;
  total: number;
  passed: boolean;
  hint?: string;
  rubric: {
    correctness: number;
    depth: number;
    understanding: number;
    clarity: number;
    feedback: string;
    keyPointsHit: string[];
    missedPoints: string[];
    misconception: string | null;
  };
  state: BossState;
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validate(state: unknown): BossState {
  if (
    !record(state) ||
    !["not_started", "active", "defeated"].includes(String(state.status)) ||
    !Array.isArray(state.players) ||
    !state.players.every(
      (player) =>
        record(player) &&
        typeof player.id === "string" &&
        typeof player.name === "string",
    ) ||
    !Array.isArray(state.progress) ||
    !state.progress.every(
      (pair) =>
        record(pair) &&
        typeof pair.playerId === "string" &&
        typeof pair.concept === "string" &&
        typeof pair.passed === "boolean",
    ) ||
    typeof state.teamAverage !== "number" ||
    typeof state.teamThreshold !== "number" ||
    !(
      state.turn === null ||
      (record(state.turn) &&
        typeof state.turn.playerId === "string" &&
        typeof state.turn.playerName === "string" &&
        record(state.turn.concept) &&
        typeof state.turn.concept.name === "string" &&
        typeof state.turn.concept.analogy === "string")
    ) ||
    !(
      state.lastAttempt === null ||
      (record(state.lastAttempt) &&
        typeof state.lastAttempt.transcript === "string" &&
        typeof state.lastAttempt.feedback === "string" &&
        Array.isArray(state.lastAttempt.missedPoints) &&
        state.lastAttempt.missedPoints.every(
          (point) => typeof point === "string",
        ))
    )
  )
    throw new Error("The boss response was incomplete. Try again.");
  return state as unknown as BossState;
}
const path = (code: string) => `/api/sessions/${encodeURIComponent(code)}/boss`;
export async function getBoss(code: string, signal?: AbortSignal) {
  return validate(await api<BossState>(path(code), { signal }));
}
export async function startBoss(code: string, signal?: AbortSignal) {
  return validate(
    await api<BossState>(`${path(code)}/start`, { method: "POST", signal }),
  );
}
export async function submitBoss(
  code: string,
  playerId: string,
  answer: string | Blob,
  signal?: AbortSignal,
) {
  const audio = typeof answer !== "string";
  const data = await api<BossGrade>(
    `${path(code)}/attempt${audio ? `?playerId=${encodeURIComponent(playerId)}` : ""}`,
    {
      method: "POST",
      headers: { "Content-Type": audio ? "audio/wav" : "application/json" },
      body: audio ? answer : JSON.stringify({ playerId, transcript: answer }),
      signal,
    },
  );
  validate(data.state);
  if (
    typeof data.transcript !== "string" ||
    typeof data.passed !== "boolean" ||
    typeof data.total !== "number" ||
    !data.rubric ||
    typeof data.rubric.feedback !== "string" ||
    (data.hint !== undefined && typeof data.hint !== "string")
  )
    throw new Error("The grading response was incomplete.");
  return data;
}
