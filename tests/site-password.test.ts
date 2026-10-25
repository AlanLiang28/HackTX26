import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { sitePassword } from "../site-password.ts";

async function serve(password: string | undefined) {
  const app = express();
  app.use(sitePassword(password));
  app.get("/", (_req, res) => res.send("home"));
  app.post("/api/game/start", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

test("site password", async (t) => {
  await t.test("blocks pages and API without the password, and asks the browser to sign in", async () => {
    const site = await serve("let-me-in");
    t.after(site.close);
    const page = await fetch(`${site.url}/`);
    assert.equal(page.status, 401);
    assert.match(page.headers.get("www-authenticate") ?? "", /^Basic realm="StudyRaid"/);
    assert.equal((await fetch(`${site.url}/api/game/start`, { method: "POST" })).status, 401);
  });

  await t.test("lets in the right password with any username, and rejects a wrong one", async () => {
    const site = await serve("let-me-in");
    t.after(site.close);
    assert.equal((await fetch(`${site.url}/`, { headers: { Authorization: basic("anyone", "let-me-in") } })).status, 200);
    assert.equal((await fetch(`${site.url}/`, { headers: { Authorization: basic("", "let-me-in") } })).status, 200);
    assert.equal((await fetch(`${site.url}/`, { headers: { Authorization: basic("anyone", "wrong") } })).status, 401);
    assert.equal((await fetch(`${site.url}/`, { headers: { Authorization: basic("let-me-in", "") } })).status, 401);
  });

  await t.test("keeps the password with colons intact", async () => {
    const site = await serve("a:b:c");
    t.after(site.close);
    assert.equal((await fetch(`${site.url}/`, { headers: { Authorization: basic("x", "a:b:c") } })).status, 200);
  });

  await t.test("is off when no password is set", async () => {
    const site = await serve(undefined);
    t.after(site.close);
    assert.equal((await fetch(`${site.url}/`)).status, 200);
  });
});
