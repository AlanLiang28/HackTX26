// Isolated browser-QA backend. No database, credentials, model calls, or production data.
// Run: node --import tsx tests/fixtures/community-preview.ts
// Frontend: STUDYRAID_API_TARGET=http://127.0.0.1:3101 npm run dev
import express from "express";
import { createGame, gameRouter } from "../../game-routes.ts";
import type { Pack } from "../../game-routes.ts";
import { computeState } from "../../boss.ts";
import type { Attempt, Rubric } from "../../boss.ts";
import { gamePack } from "./game-pack.ts";

Math.random = () => 0;
const app = express();
app.use("/api/game", gameRouter);
app.use(express.json());
const pack: Pack = {
  ...gamePack,
  subtopics: gamePack.subtopics.map((sub, i) => ({ ...sub, id: `s${i}` })),
  questions: gamePack.subtopics.flatMap((sub, i) =>
    sub.questions.map((q, j) => ({
      ...q,
      id: `s${i}q${j}`,
      subtopic: `s${i}`,
    })),
  ),
};
type Member = {
  id: string;
  name: string;
  interests: string[];
  theme: "sports" | "fantasy";
  ready: boolean;
  kind: "class" | "free";
  classCode?: string;
  attempts: number;
  correct: number;
  grouped: boolean;
};
const members = new Map<string, Member>();
const classes = new Map([
  [
    "BIO101",
    {
      code: "BIO101",
      name: "Cell Biology",
      teacherName: "Professor Oak",
      teacherToken: "preview-teacher-key",
      level: "high school",
    },
  ],
]);
const fights = new Map<
  string,
  {
    owner: Member;
    started: boolean;
    attempts: Attempt[];
    last: {
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
  }
>();
const fail = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ error: "preview_error", message });
const makeGame = (member: Member) =>
  createGame(pack, member.name, (_topic, correct, phase) => {
    member.attempts++;
    if (correct) member.correct++;
    if (phase === "boss_ready") member.ready = true;
  });
function memberView(member: Member) {
  const fight = [...fights.entries()].find(
    ([, fight]) => fight.owner.id === member.id,
  );
  return {
    member: {
      id: member.id,
      name: member.name,
      interests: member.interests,
      theme: member.theme,
      ready: member.ready,
    },
    group:
      member.grouped && fight
        ? {
            code: fight[0],
            playerId: `player-${member.id}`,
            theme: member.theme,
            bossStarted: fight[1].started,
            members: [
              { id: member.id, name: member.name, interests: member.interests },
              { id: "peer", name: "Linus", interests: ["anime", "gaming"] },
            ],
          }
        : null,
    matches: member.grouped
      ? []
      : [
          {
            memberId: "peer",
            name: "Linus",
            interests: ["anime", "gaming"],
            shared: member.interests.filter((tag) =>
              ["anime", "gaming"].includes(tag),
            ),
            topic: member.kind === "free" ? 0.93 : null,
            score: 0.8,
            ready: true,
            groupSize: 1,
          },
          {
            memberId: "waiting",
            name: "Morgan",
            interests: ["music", "chess"],
            shared: [],
            topic: member.kind === "free" ? 0.4 : null,
            score: 0.2,
            ready: false,
            groupSize: 1,
          },
        ],
  };
}
const find = (id: string, res: express.Response) => {
  const m = members.get(id);
  if (!m) fail(res, 404, "We could not find that player.");
  return m;
};
app.post("/api/classes", (req, res) => {
  const cls = {
    code: "CLASS1",
    name: req.body.name,
    teacherName: req.body.teacherName,
    teacherToken: "preview-created-key",
    level: req.body.level,
  };
  classes.set(cls.code, cls);
  res.json({ code: cls.code, name: cls.name, teacherToken: cls.teacherToken });
});
app.get("/api/classes/:code", (req, res) => {
  const cls = classes.get(req.params.code);
  if (!cls) return fail(res, 404, "No class with that code.");
  if (req.get("X-Teacher-Token") !== cls.teacherToken)
    return fail(res, 403, "Only the teacher can open the class dashboard.");
  const roster = [...members.values()].filter((m) => m.classCode === cls.code);
  res.json({
    ...cls,
    teacherToken: undefined,
    worldsReady: ["sports", "fantasy"],
    members: [
      {
        id: "seed",
        name: "Bo",
        interests: ["football", "music"],
        theme: "sports",
        ready: true,
        groupCode: null,
        attempts: 6,
        accuracy: 0.83,
      },
      ...roster.map((m) => ({
        id: m.id,
        name: m.name,
        interests: m.interests,
        theme: m.theme,
        ready: m.ready,
        groupCode: m.grouped ? "PARTY1" : null,
        attempts: m.attempts,
        accuracy: m.attempts ? m.correct / m.attempts : null,
      })),
    ],
    groups: [...fights.entries()]
      .filter(([, f]) => f.owner.classCode === cls.code)
      .map(([code, f]) => ({
        code,
        theme: f.owner.theme,
        boss: !f.started ? "not_started" : bossView(code).status,
        members: [f.owner.name, "Linus"],
      })),
    topics: [
      { subtopic: "Nucleus", attempts: 14, accuracy: 0.42 },
      { subtopic: "Mitochondria", attempts: 12, accuracy: 0.75 },
    ],
  });
});
app.post("/api/classes/:code/join", (req, res) => {
  const cls = classes.get(req.params.code);
  if (!cls) return fail(res, 404, "No class with that code.");
  const id = `member-${members.size + 1}`;
  members.set(id, {
    id,
    name: req.body.name,
    interests: req.body.interests,
    theme: "fantasy",
    ready: false,
    kind: "class",
    classCode: cls.code,
    attempts: 0,
    correct: 0,
    grouped: false,
  });
  res.json({
    memberId: id,
    class: { code: cls.code, name: cls.name, teacherName: cls.teacherName },
  });
});
app.post("/api/classes/:code/members/:id/play", (req, res) => {
  const m = find(req.params.id, res);
  if (m) {
    m.theme = req.body.theme;
    res.json(makeGame(m));
  }
});
app.get("/api/classes/:code/members/:id", (req, res) => {
  const m = find(req.params.id, res);
  if (m) res.json(memberView(m));
});
app.post("/api/free-agents", (req, res) => {
  const id = `member-${members.size + 1}`;
  const m: Member = {
    id,
    name: req.body.name,
    interests: req.body.interests,
    theme: req.body.theme,
    ready: false,
    kind: "free",
    attempts: 0,
    correct: 0,
    grouped: false,
  };
  members.set(id, m);
  res.json({ memberId: id, ...makeGame(m) });
});
app.post("/api/free-agents/:id/play", (req, res) => {
  const m = find(req.params.id, res);
  if (m) res.json(makeGame(m));
});
app.get("/api/free-agents/:id", (req, res) => {
  const m = find(req.params.id, res);
  if (m) res.json(memberView(m));
});
function match(req: express.Request, res: express.Response) {
  const m = find(req.body.memberId, res);
  if (!m) return;
  if (!m.ready) return fail(res, 409, "You both need to reach the boss first.");
  m.grouped = true;
  fights.set("PARTY1", { owner: m, started: false, attempts: [], last: null });
  res.json(memberView(m));
}
app.post("/api/classes/:code/groups", match);
app.post("/api/free-agents/groups", match);
const concepts = pack.subtopics
  .slice(0, 2)
  .map((sub) => ({
    name: sub.name,
    analogy: sub.analogy,
    explanation: sub.lesson,
    key_points: ["Accurate real-world explanation"],
  }));
function bossView(code: string) {
  const f = fights.get(code)!;
  const players = [
    { id: `player-${f.owner.id}`, name: f.owner.name },
    { id: "peer-player", name: "Linus" },
  ];
  const computed = computeState({
    roster: players,
    keyConcepts: concepts,
    attempts: f.attempts,
  });
  return {
    ...computed,
    status: f.started ? computed.status : "not_started",
    turn: f.started ? computed.turn : null,
    players,
    teamThreshold: 0.75,
    lastAttempt: f.last,
  };
}
app.get("/api/sessions/:code/boss", (req, res) => {
  if (!fights.has(req.params.code))
    return fail(res, 404, "No session with that code.");
  res.json(bossView(req.params.code));
});
app.post("/api/sessions/:code/boss/start", (req, res) => {
  const f = fights.get(req.params.code);
  if (!f) return fail(res, 404, "No session with that code.");
  f.started = true;
  res.json(bossView(req.params.code));
});
app.post("/api/sessions/:code/boss/attempt", (req, res) => {
  const f = fights.get(req.params.code);
  if (!f) return fail(res, 404, "No session with that code.");
  const state = bossView(req.params.code);
  const turn = state.turn;
  if (!turn || turn.playerId !== req.body.playerId)
    return fail(res, 409, "It is not your turn.");
  const passed = !String(req.body.transcript).toLowerCase().includes("wrong");
  const total = passed ? 14 : 8;
  const rubric: Rubric = {
    correctness: passed ? 4 : 2,
    depth: passed ? 4 : 2,
    understanding: passed ? 3 : 2,
    clarity: passed ? 3 : 2,
    keyPointsHit: passed ? ["Core function"] : [],
    missedPoints: passed ? [] : ["Explain the structure’s real function."],
    misconception: null,
    feedback: passed
      ? "Clear explanation. You connected the idea to an example."
      : "Check the real function, then try a more specific explanation.",
  };
  f.attempts.push({
    player_id: turn.playerId,
    concept: turn.concept.name,
    total,
    passed,
  });
  f.last = {
    playerId: turn.playerId,
    playerName: turn.playerName,
    concept: turn.concept.name,
    transcript: req.body.transcript,
    total,
    passed,
    feedback: rubric.feedback,
    missedPoints: rubric.missedPoints,
    createdAt: new Date().toISOString(),
  };
  res.json({
    transcript: req.body.transcript,
    total,
    passed,
    rubric,
    state: bossView(req.params.code),
  });
  if (passed)
    setTimeout(() => {
      const next = bossView(req.params.code).turn;
      if (next?.playerId === "peer-player") {
        f.attempts.push({
          player_id: next.playerId,
          concept: next.concept.name,
          total: 14,
          passed: true,
        });
        f.last = {
          playerId: next.playerId,
          playerName: "Linus",
          concept: next.concept.name,
          transcript: "A clear explanation from your teammate.",
          total: 14,
          passed: true,
          feedback: "A good connection.",
          missedPoints: [],
          createdAt: new Date().toISOString(),
        };
      }
    }, 1800);
});
app.post("/api/coach", (_req, res) =>
  res.json({
    script: "The nucleus stores genetic information, like plans in a castle.",
    audioBase64: null,
    mimeType: "audio/wav",
    persona: "Your study guide",
  }),
);
app.listen(3101, "127.0.0.1", () =>
  console.log("Isolated community preview API: http://127.0.0.1:3101"),
);
