import assert from "node:assert/strict";
import { test } from "node:test";
import { generateJson, generateText, LlmError, pdfText, streamText } from "../llm.ts";

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
const modelOf = (url: string | URL | Request) => /models\/([^:]+):/.exec(String(url))?.[1] ?? "";

test("Gemini backup API key", async (t) => {
  const settings = {
    GEMINI_API_KEY: "main-key",
    GEMINI_FALLBACK_API_KEY: "backup-key",
    GEMINI_MODEL: "main-model",
    GEMINI_FALLBACK_MODEL: "lite-model",
  };
  const MUSE_KEYS = ["META_API_KEY", "MUSE_API"];
  const previous = Object.fromEntries([...Object.keys(settings), ...MUSE_KEYS].map((k) => [k, process.env[k]]));
  Object.assign(process.env, settings);
  for (const k of MUSE_KEYS) delete process.env[k]; // Gemini-only until the Muse tests at the end
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
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

  await t.test("moves to the fallback model when the main model stays overloaded", async () => {
    const models: string[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      models.push(modelOf(url));
      return modelOf(url) === "main-model" ? overloaded() : answer("from the lite model");
    });
    assert.equal(await generateText("hi"), "from the lite model");
    assert.deepEqual(models, ["main-model", "main-model", "lite-model"]); // one retry, then the switch
    fetch.mock.restore();
  });

  await t.test("gives up when both models stay overloaded", async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () => overloaded());
    await assert.rejects(generateText("hi"), (err: unknown) => {
      assert(err instanceof LlmError);
      assert.match(err.message, /overloaded/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 4); // a try and a retry on each model
    fetch.mock.restore();
  });

  await t.test("says the daily limit is used up when both keys are out, without switching models", async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () => quotaError());
    await assert.rejects(generateText("hi"), (err: unknown) => {
      assert(err instanceof LlmError);
      assert.match(err.message, /free daily limit is used up/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 2);
    fetch.mock.restore();
  });
  // ---------- Muse first ----------
  const isMuse = (url: string | URL | Request) => String(url).startsWith("https://api.meta.ai/");
  const museAnswer = (content: string) =>
    new Response(
      JSON.stringify({ id: "c1", object: "chat.completion", created: 0, model: "muse-spark-1.3",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }),
      { headers: { "Content-Type": "application/json" } },
    );

  await t.test("asks Muse first when there's a Muse key, and Gemini isn't called", async () => {
    process.env.MUSE_API = "muse-key";
    const urls: string[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      urls.push(String(url));
      return isMuse(url) ? museAnswer("from muse") : answer("from gemini");
    });
    assert.equal(await generateText("hi"), "from muse");
    assert.deepEqual(urls, ["https://api.meta.ai/v1/chat/completions"]);
    fetch.mock.restore();
  });

  await t.test("falls back to Gemini when Muse fails", async () => {
    const fetch = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
      isMuse(url)
        ? new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "Content-Type": "application/json" } })
        : answer("from gemini"),
    );
    assert.equal(await generateText("hi"), "from gemini");
    fetch.mock.restore();
  });

  await t.test("streams from Muse and reports progress as text arrives", async () => {
    const pieces = ['{"title":', '"Cells"}'];
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      new Response(
        pieces
          .map((content) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`)
          .join("") + "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const progress: string[] = [];
    assert.equal(await streamText("hi", (soFar) => progress.push(soFar)), '{"title":"Cells"}');
    assert.deepEqual(progress, ['{"title":', '{"title":"Cells"}']);
    fetch.mock.restore();
  });

  await t.test("grading asks Muse for strict JSON that follows the schema", async () => {
    let body: { response_format?: { type: string; json_schema: { name: string; strict: boolean; schema: object } } } = {};
    const schema = { type: "object", properties: { score: { type: "integer" } }, required: ["score"], additionalProperties: false };
    const fetch = t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return museAnswer('{"score":3}');
    });
    assert.equal(await generateJson("grade it", "rubric", schema), '{"score":3}');
    assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "rubric", strict: true, schema } });
    fetch.mock.restore();
  });
  await t.test("reads a PDF with Muse, sending the file itself, without calling Gemini", async () => {
    const urls: string[] = [];
    let content: { type: string; file?: { filename: string; file_data: string } }[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      content = JSON.parse(String(init?.body)).messages[0].content;
      return museAnswer("Mitochondria make ATP.");
    });
    assert.equal(await pdfText(Buffer.from("%PDF-1.4 fake")), "Mitochondria make ATP.");
    assert.deepEqual(urls, ["https://api.meta.ai/v1/chat/completions"]);
    assert.equal(content[0].type, "file");
    assert.equal(content[0].file?.file_data, `data:application/pdf;base64,${Buffer.from("%PDF-1.4 fake").toString("base64")}`);
    fetch.mock.restore();
  });
});
