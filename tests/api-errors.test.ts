import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { apiErrors, apiNotFound } from "../api-errors.ts";

async function serve() {
  const app = express();
  app.use(express.json());
  app.post("/api/echo", (req, res) => res.json(req.body));
  app.get("/api/nul", () => {
    throw Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: "22021" });
  });
  app.get("/api/boom", () => {
    throw new Error("db down");
  });
  app.use("/api", apiNotFound);
  app.use((_req, res) => res.send("<!doctype html>site"));
  app.use(apiErrors);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}
const post = (url: string, body: string) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });

test("api errors", async (t) => {
  const site = await serve();
  t.after(site.close);
  console.error = () => {}; // the handler logs every error; keep the test output clean

  await t.test("bad JSON and too-big bodies get JSON, not a stack trace", async () => {
    let r = await post(`${site.url}/api/echo`, "{bad");
    assert.equal(r.status, 400);
    let text = await r.text();
    assert.equal(JSON.parse(text).error, "entity.parse.failed");
    assert.doesNotMatch(text, /node_modules/);
    r = await post(`${site.url}/api/echo`, JSON.stringify({ x: "a".repeat(200_000) }));
    assert.equal(r.status, 413);
    text = await r.text();
    assert.equal(JSON.parse(text).error, "entity.too.large");
    assert.doesNotMatch(text, /node_modules/);
  });

  await t.test("a NUL byte Postgres refuses is a 400, other failures a plain 500", async () => {
    let r = await fetch(`${site.url}/api/nul`);
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "bad_request", message: "Bad request." });
    r = await fetch(`${site.url}/api/boom`);
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "internal", message: "Something went wrong." });
  });

  await t.test("unknown API routes 404 in JSON; site pages still get the app", async () => {
    for (const [method, path] of [["GET", "/api/nope"], ["DELETE", "/api/echo"], ["GET", "/api"]]) {
      const r = await fetch(`${site.url}${path}`, { method });
      assert.equal(r.status, 404, `${method} ${path}`);
      assert.equal((await r.json()).error, "not_found");
    }
    const page = await fetch(`${site.url}/teacher`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /site/);
    assert.equal((await post(`${site.url}/api/echo`, '{"ok":1}').then((r) => r.json())).ok, 1);
  });
});
