import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import express from "express";
import { gameRouter, onPackConcept } from "../game-routes.ts";
import { gamePack } from "./fixtures/game-pack.ts";
import { lessonLines } from "../coach.ts";
import { getLessonLines } from "../src/lib/characters.ts";
import { adaptiveStudySession } from "../src/lib/adaptive.ts";
import { isStudySession } from "../src/lib/study.ts";
import type {
  AdaptiveGame,
  GameState,
  GradedAnswer,
  RemoteEncounter,
} from "../src/lib/adaptive.ts";

test("adaptive game API", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-key";
  let modelCalls = 0;
  // Streams the pack in small pieces, like Gemini does, so concepts are found in partial output.
  t.mock.method(globalThis, "fetch", async () => {
    modelCalls++;
    const text = JSON.stringify(gamePack, null, 2);
    const events = (text.match(/[\s\S]{1,40}/g) ?? []).map(
      (piece) =>
        `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: piece }] } }] })}\n\n`,
    );
    return new Response(events.join(""), {
      headers: { "Content-Type": "text/event-stream" },
    });
  });
  const announced: {
    title: string;
    interest: string;
    index: number;
    concept: { name: string; analogy: string; lesson: string };
  }[] = [];
  onPackConcept((title, interest, concept, index) =>
    announced.push({ title, interest, index, concept }),
  );
  t.mock.method(Math, "random", () => 0);
  const app = express();
  app.use("/api/game", gameRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    onPackConcept(null);
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  function post<T>(path: string, body: unknown, status = 200): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: `/api/game${path}`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            text += chunk;
          });
          res.on("end", () => {
            try {
              assert.equal(res.statusCode, status, text);
              resolve(JSON.parse(text) as T);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
  }
  const start = () =>
    post<AdaptiveGame>("/start", {
      interest: "fantasy adventures, knights, and dragons",
      material: "Cell structures and their functions.",
    });
  const next = (game: AdaptiveGame) =>
    post<{ encounter: RemoteEncounter | null; state: GameState }>(
      `/${game.gameId}/next`,
      { playerId: game.playerId },
    );
  const answer = (
    game: AdaptiveGame,
    encounter: RemoteEncounter,
    correct: boolean,
  ) =>
    post<GradedAnswer>(`/${game.gameId}/answer`, {
      playerId: game.playerId,
      questionId: encounter.question.id,
      choice: encounter.question.options.findIndex((option) =>
        correct
          ? option === "Supported by the notes"
          : option !== "Supported by the notes",
      ),
    });

  await t.test(
    "serves lessons without leaking the answer bank and keeps an unanswered encounter stable",
    async () => {
      const calls = modelCalls;
      const game = await start();
      assert.equal(modelCalls, calls + 1);
      assert.equal(game.pack.subtopics.length, 4);
      assert.match(game.pack.subtopics[0].lesson, /specialized role/);
      assert(!("questions" in game.pack));
      assert(!("questions" in game.pack.subtopics[0]));
      const first = await next(game);
      assert(first.encounter);
      assert(!("answer" in first.encounter.question));
      assert(!("explanation" in first.encounter.question));
      assert.deepEqual((await next(game)).encounter, first.encounter);
      assert.equal(modelCalls, calls + 1);
    },
  );

  await t.test(
    "announces each concept once while the pack streams, and starts with the first",
    async () => {
      announced.length = 0;
      const game = await start();
      assert.deepEqual(
        announced.map((c) => [c.index, c.concept.name]),
        [[0, "Nucleus"], [1, "Mitochondria"], [2, "Membrane"], [3, "Ribosomes"]],
      );
      assert(announced.every((c) => c.title === "The Cell Kingdom"));
      const first = (await next(game)).encounter!;
      assert.equal(first.enemy.subtopic, "Nucleus");

      // The server voices these lines early (warmLessonLines), so they must be exactly what the
      // first encounter's dialogue box shows, as App.tsx builds it.
      const session = adaptiveStudySession(game, "", "sports");
      session.content.quiz[0].subtopic = first.enemy.subtopic;
      // App.tsx's refresh resume drops any saved run that fails this check.
      assert.ok(isStudySession(session));
      assert.deepEqual(
        getLessonLines(session, 0, false),
        lessonLines(announced[0].concept),
      );
    },
  );

  await t.test(
    "misses prioritize a fresh question in the weaker topic; recovery restores coverage",
    async () => {
      const game = await start();
      const first = (await next(game)).encounter!;
      const missed = await answer(game, first, false);
      assert.equal(missed.state.lives, 2);
      assert.equal(missed.state.completed, 1);
      assert.equal(
        missed.state.report.find((s) => s.id === first.question.subtopicId)
          ?.score,
        1 / 3,
      );
      const second = (await next(game)).encounter!;
      assert.equal(second.question.subtopicId, first.question.subtopicId);
      assert.notEqual(second.question.id, first.question.id);
      const recovered = await answer(game, second, true);
      assert.equal(
        recovered.state.report.find((s) => s.id === first.question.subtopicId)
          ?.score,
        0.5,
      );
      const third = (await next(game)).encounter!;
      assert.notEqual(third.question.subtopicId, first.question.subtopicId);
      assert.equal(recovered.state.lives, 2);
    },
  );

  await t.test(
    "a correct answer moves away from the stronger topic",
    async () => {
      const game = await start();
      const first = (await next(game)).encounter!;
      const graded = await answer(game, first, true);
      assert.equal(
        graded.state.report.find((s) => s.id === first.question.subtopicId)
          ?.score,
        2 / 3,
      );
      assert.notEqual(
        (await next(game)).encounter!.question.subtopicId,
        first.question.subtopicId,
      );
    },
  );

  await t.test(
    "retries are idempotent and stale answers cannot grade a different question",
    async () => {
      const game = await start();
      const first = (await next(game)).encounter!;
      const graded = await answer(game, first, false);
      const second = (await next(game)).encounter!;
      const retried = await answer(game, first, true);
      assert.deepEqual(retried, graded);
      assert.deepEqual((await next(game)).encounter, second);
      await answer(game, second, true);
      const third = (await next(game)).encounter!;
      await post(
        `/${game.gameId}/answer`,
        { playerId: game.playerId, questionId: first.question.id, choice: 0 },
        409,
      );
      assert.deepEqual((await next(game)).encounter, third);
      await post(
        `/${game.gameId}/answer`,
        { playerId: game.playerId, questionId: third.question.id, choice: 8 },
        400,
      );
      assert.equal((await next(game)).state.completed, 2);
    },
  );

  await t.test(
    "three misses end a run; replay resets lives and proficiency without a model call",
    async () => {
      const game = await start();
      const ids = new Set<string>();
      let last: GradedAnswer | undefined;
      for (let i = 0; i < 3; i++) {
        const encounter = (await next(game)).encounter!;
        assert(!ids.has(encounter.question.id));
        ids.add(encounter.question.id);
        last = await answer(game, encounter, false);
      }
      assert.equal(last!.state.phase, "game_over");
      assert.equal(last!.state.lives, 0);
      assert.equal(last!.state.completed, 3);
      assert(last!.state.weakest!.attempts > 0);
      assert.equal((await next(game)).encounter, null);
      const calls = modelCalls;
      const restarted = await post<{ state: GameState }>(
        `/${game.gameId}/restart`,
        { playerId: game.playerId },
      );
      assert.equal(restarted.state.lives, 3);
      assert.equal(restarted.state.completed, 0);
      assert.equal(restarted.state.phase, "battle");
      assert.deepEqual(restarted.state.trail, []);
      assert(
        restarted.state.report.every(
          (s) => s.attempts === 0 && s.correct === 0 && s.score === 0.5,
        ),
      );
      assert.equal(modelCalls, calls);
      assert((await next(game)).encounter);
    },
  );

  await t.test(
    "three study encounters unlock the fourth and final boss encounter",
    async () => {
      const game = await start();
      assert.equal(game.state.total, 3);
      const ids = new Set<string>();
      let last: GradedAnswer | undefined;
      for (let i = 0; i < 3; i++) {
        const encounter = (await next(game)).encounter!;
        assert(!ids.has(encounter.question.id));
        ids.add(encounter.question.id);
        last = await answer(game, encounter, i !== 0);
        assert.equal(last.state.phase, i < 2 ? "battle" : "boss_ready");
      }
      assert.equal(last!.state.phase, "boss_ready");
      assert.equal(last!.state.defeated, 2);
      assert.equal(last!.state.completed, 3);
      const tested = last!.state.report.filter((s) => s.attempts > 0);
      assert.equal(
        last!.state.weakest!.score,
        Math.min(...tested.map((s) => s.score)),
      );
      assert(last!.state.weakest!.attempts > 0);
      assert.equal((await next(game)).encounter, null);
    },
  );
});
