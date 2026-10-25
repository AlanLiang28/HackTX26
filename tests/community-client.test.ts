import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addFriend,
  ApiError,
  createClass,
  getChat,
  getDashboard,
  getFriends,
  getMember,
  joinClass,
  pickPartner,
  playMember,
  sendChat,
  startFreeAgent,
} from "../src/lib/classroom.ts";
import { getBoss, startBoss, submitBoss } from "../src/lib/party.ts";
import { saveQuest } from "../src/lib/study.ts";
import { fetchConceptVoice } from "../src/lib/voice.ts";

const profile = { name: "Ada" };
const memberView = {
  member: { id: "member", ...profile, theme: "fantasy", ready: true },
  group: null,
  matches: [],
};
const game = {
  gameId: "game",
  playerId: "player",
  pack: {
    title: "Cells",
    overview: "Cell structures",
    summary: "Cells work together.",
    limitation: "A simplified analogy.",
    subtopics: [
      {
        id: "s0",
        name: "Nucleus",
        lesson: "Stores genetic information.",
        analogy: "A command center",
      },
    ],
  },
  state: {
    playerId: "player",
    name: "Ada",
    lives: 3,
    maxLives: 3,
    completed: 0,
    total: 6,
    defeated: 0,
    trail: [],
    phase: "battle",
    report: [],
    weakest: null,
  },
};
const bossState = {
  status: "active",
  teamAverage: 0,
  teamThreshold: 0.75,
  players: [{ id: "player", name: "Ada" }],
  turn: {
    playerId: "player",
    playerName: "Ada",
    concept: { name: "Nucleus", analogy: "Command center" },
    attempt: 1,
    reason: "unpassed",
  },
  progress: [
    {
      playerId: "player",
      concept: "Nucleus",
      passed: false,
      bestTotal: 0,
      attempts: 0,
    },
  ],
  lastAttempt: null,
};

test("community clients follow the class, matching, teacher and boss contracts", async (t) => {
  const calls: { path: string; options: RequestInit }[] = [];
  let reply: unknown = {};
  let status = 200;
  t.mock.method(
    globalThis,
    "fetch",
    async (path: string, options: RequestInit) => {
      calls.push({ path, options });
      return new Response(JSON.stringify(reply), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const last = () => calls.at(-1)!;
  await t.test(
    "concept voices cache a lesson per world and retain its facts",
    async () => {
      const concept = {
        concept: "Nucleus",
        analogy: "A castle's plans",
        explanation: "Stores genetic information.",
      };
      reply = {
        script: "The nucleus stores DNA.",
        audioBase64: null,
        mimeType: "audio/wav",
      };
      const before = calls.length;
      await Promise.all([
        fetchConceptVoice("Cells", "fantasy", concept),
        fetchConceptVoice("Cells", "fantasy", concept),
      ]);
      assert.equal(calls.length, before + 1);
      assert.equal(last().path, "/api/coach");
      assert.deepEqual(JSON.parse(String(last().options.body)), {
        topic: "Nucleus (part of Cells)",
        interest: "fantasy",
        facts: ["Nucleus: like A castle's plans. Stores genetic information."],
      });
      await fetchConceptVoice("Cells", "football", concept);
      assert.equal(calls.length, before + 2);
      status = 503;
      reply = { error: "Voice unavailable" };
      await assert.rejects(() =>
        fetchConceptVoice("Retry lesson", "football", concept),
      );
      status = 200;
      reply = {
        script: "Try again.",
        audioBase64: null,
        mimeType: "audio/wav",
      };
      await fetchConceptVoice("Retry lesson", "football", concept);
      assert.equal(calls.length, before + 4);
    },
  );
  await t.test(
    "free-agent signup includes notes and the preset world",
    async () => {
      reply = { memberId: "member", ...game };
      const result = await startFreeAgent(profile, "My cell notes", "fantasy");
      assert.equal(last().path, "/api/free-agents");
      assert.deepEqual(JSON.parse(String(last().options.body)), {
        ...profile,
        material: "My cell notes",
        theme: "fantasy",
      });
      assert.equal(result.member.kind, "free");
      assert.equal(result.game.gameId, "game");
    },
  );
  await t.test(
    "class join normalizes the code and play uses the returned identity",
    async () => {
      reply = {
        memberId: "member",
        class: { code: "BIO101", name: "Biology", teacherName: "Oak" },
      };
      const member = await joinClass(" bio101 ", profile, "sports");
      assert.equal(last().path, "/api/classes/BIO101/join");
      reply = game;
      await playMember(member, "sports");
      assert.equal(last().path, "/api/classes/BIO101/members/member/play");
      assert.deepEqual(JSON.parse(String(last().options.body)), {
        theme: "sports",
      });
      reply = memberView;
      await getMember(member);
      assert.equal(last().path, "/api/classes/BIO101/members/member");
      assert.equal(last().options.method, undefined);
      await pickPartner(member, "partner");
      assert.equal(last().path, "/api/classes/BIO101/groups");
      assert.deepEqual(JSON.parse(String(last().options.body)), {
        memberId: "member",
        partnerId: "partner",
      });
    },
  );
  await t.test(
    "free-agent status, replay and grouping use the free-agent endpoints",
    async () => {
      const member = {
        ...profile,
        memberId: "member",
        kind: "free" as const,
        theme: "fantasy" as const,
      };
      reply = memberView;
      await getMember(member);
      assert.equal(last().path, "/api/free-agents/member");
      await pickPartner(member, "partner");
      assert.equal(last().path, "/api/free-agents/groups");
      reply = game;
      await playMember(member, "fantasy");
      assert.equal(last().path, "/api/free-agents/member/play");
    },
  );
  await t.test("teacher key is sent only in the dashboard header", async () => {
    reply = {
      code: "BIO101",
      name: "Biology",
      teacherToken: "test-private-key",
    };
    const saved = await createClass({
      name: "Biology",
      teacherName: "Oak",
      material: "Cell notes",
      level: "high school",
    });
    assert.equal(last().path, "/api/classes");
    reply = {
      ...saved,
      teacherName: "Oak",
      level: "high school",
      worldsReady: [],
      members: [],
      groups: [],
      topics: [],
    };
    await getDashboard(saved);
    assert.equal(last().path, "/api/classes/BIO101");
    assert.equal(
      new Headers(last().options.headers).get("X-Teacher-Token"),
      "test-private-key",
    );
    assert.equal(last().options.body, undefined);
  });
  await t.test("member, friends and chat calls carry the member token", async () => {
    reply = {
      memberId: "member",
      memberToken: "secret",
      class: { code: "BIO101", name: "Biology", teacherName: "Oak" },
    };
    const member = await joinClass("BIO101", profile, "sports");
    assert.equal(member.token, "secret");
    const token = () =>
      new Headers(last().options.headers).get("X-Member-Token");
    reply = game;
    await playMember(member, "sports");
    assert.equal(token(), "secret");
    reply = memberView;
    await getMember(member);
    assert.equal(token(), "secret");
    await pickPartner(member, "peer");
    assert.equal(token(), "secret");
    reply = { friends: [{ id: "peer", name: "Linus", status: "incoming" }] };
    assert.equal((await getFriends(member))[0].status, "incoming");
    assert.equal(last().path, "/api/members/member/friends");
    assert.equal(token(), "secret");
    await addFriend(member, "peer");
    assert.equal(last().options.method, "POST");
    assert.deepEqual(JSON.parse(String(last().options.body)), {
      friendId: "peer",
    });
    assert.equal(token(), "secret");
    reply = { messages: [] };
    await getChat(member, "peer");
    assert.equal(last().path, "/api/members/member/friends/peer/messages");
    assert.equal(token(), "secret");
    await sendChat(member, "peer", "hi");
    assert.deepEqual(JSON.parse(String(last().options.body)), { body: "hi" });
    assert.equal(token(), "secret");
    reply = {};
    await assert.rejects(() => getFriends(member), ApiError);
  });
  await t.test(
    "boss polling and start preserve server turn ownership",
    async () => {
      reply = bossState;
      assert.equal((await getBoss("PARTY1")).turn?.playerId, "player");
      assert.equal(last().path, "/api/sessions/PARTY1/boss");
      await startBoss("PARTY1");
      assert.equal(last().path, "/api/sessions/PARTY1/boss/start");
      assert.equal(last().options.method, "POST");
    },
  );
  await t.test(
    "typed and WAV explanations use their respective body formats",
    async () => {
      reply = {
        transcript: "The nucleus stores DNA.",
        passed: true,
        total: 13,
        rubric: { feedback: "Well explained." },
        state: bossState,
      };
      await submitBoss("PARTY1", "player", "The nucleus stores DNA.");
      assert.deepEqual(JSON.parse(String(last().options.body)), {
        playerId: "player",
        transcript: "The nucleus stores DNA.",
      });
      assert.equal(
        new Headers(last().options.headers).get("Content-Type"),
        "application/json",
      );
      const wav = new Blob([new Uint8Array([82, 73, 70, 70])], {
        type: "audio/wav",
      });
      await submitBoss("PARTY1", "player/a", wav);
      assert.equal(
        last().path,
        "/api/sessions/PARTY1/boss/attempt?playerId=player%2Fa",
      );
      assert.equal(last().options.body, wav);
      assert.equal(
        new Headers(last().options.headers).get("Content-Type"),
        "audio/wav",
      );
    },
  );
  await t.test(
    "shows the human message for group, turn and teacher errors",
    async () => {
      status = 409;
      reply = { error: "group_full", message: "That party is full." };
      await assert.rejects(
        () =>
          pickPartner(
            { ...profile, memberId: "member", kind: "free", theme: "sports" },
            "partner",
          ),
        (error) =>
          error instanceof ApiError &&
          error.code === "group_full" &&
          error.message === "That party is full.",
      );
      status = 200;
      reply = { memberId: "member" };
      await assert.rejects(
        () => startFreeAgent(profile, "Notes", "sports"),
        /incomplete/,
      );
      reply = { status: "active" };
      await assert.rejects(
        () => getBoss("PARTY1"),
        /boss response was incomplete/,
      );
    },
  );
});

test("reopening a completed party replaces its quest-log entry", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  try {
    const record = {
      id: "boss-PARTY1-member",
      title: "Cells",
      theme: "fantasy" as const,
      score: 5,
      total: 6,
      completedAt: new Date().toISOString(),
      players: 2,
      demo: false,
    };
    saveQuest(record);
    const records = saveQuest({ ...record, players: 3 });
    assert.equal(records.length, 1);
    assert.equal(records[0].players, 3);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
