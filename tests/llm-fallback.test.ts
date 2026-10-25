import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText, LlmError } from "../llm.ts";

const quotaError = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      },
    }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
const overloaded = () =>
  new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
const answer = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] } }] }), {
    headers: { "Content-Type": "application/json" },
  });
const keyOf = (init?: RequestInit) => new Headers(init?.headers).get("x-goog-api-key");

test("Gemini backup API key", async (t) => {
  const previous = { main: process.env.GEMINI_API_KEY, backup: process.env.GEMINI_FALLBACK_API_KEY };
  process.env.GEMINI_API_KEY = "main-key";
  process.env.GEMINI_FALLBACK_API_KEY = "backup-key";
  t.after(() => {
    for (const [name, value] of [["GEMINI_API_KEY", previous.main], ["GEMINI_FALLBACK_API_KEY", previous.backup]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});

  await t.test("uses the backup key when the main key is out of quota", async () => {
    const keys: (string | null)[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      keys.push(keyOf(init));
      return keyOf(init) === "main-key" ? quotaError() : answer("from backup");
    });
    assert.equal(await generateText("hi"), "from backup");
    assert.deepEqual(keys, ["main-key", "backup-key"]);
    fetch.mock.restore();
  });

  await t.test("retries once on the same key when Gemini is overloaded", async () => {
    const keys: (string | null)[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      keys.push(keyOf(init));
      return keys.length === 1 ? overloaded() : answer("after retry");
    });
    assert.equal(await generateText("hi"), "after retry");
    assert.deepEqual(keys, ["main-key", "main-key"]);
    fetch.mock.restore();
  });

  await t.test("gives up after one retry if Gemini stays overloaded", async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () => overloaded());
    await assert.rejects(generateText("hi"), (err: unknown) => {
      assert(err instanceof LlmError);
      assert.match(err.message, /overloaded/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 2);
    fetch.mock.restore();
  });

  await t.test("says the daily limit is used up when both keys are out", async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () => quotaError());
    await assert.rejects(generateText("hi"), (err: unknown) => {
      assert(err instanceof LlmError);
      assert.match(err.message, /free daily limit is used up/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 2);
    fetch.mock.restore();
  });
});
