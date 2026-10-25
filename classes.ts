// Classes and free agents. Spec: docs/classes.md
// A teacher creates a class, students join, play phase 1 (the adaptive game) on their own, then match with
// classmates who picked the same world and fight the boss together. Free agents do the same without a class:
// they bring their own notes and match with other free agents on world AND topic (pgvector).
// A group IS a `sessions` row plus `players` rows, so boss.ts's /api/sessions/:code/boss/* routes run it unchanged.
import express from "express";
import type pg from "pg";
import type { GoogleGenAI } from "@google/genai";
import { randomBytes, randomUUID } from "node:crypto";
import { createGame, generatePack, type Pack } from "./game-routes.ts";
import { LlmError } from "./llm.ts";
import type { Concept } from "./boss.ts";
import { interestFor } from "./src/lib/adaptive.ts";

export const MAX_GROUP = 4;
export const KEY_CONCEPTS = 2;   // boss concepts per group: the group's weakest phase 1 subtopics
const MAX_MATERIAL = 20000;      // same cap as the notes screen
const THEMES = ["sports", "fantasy"] as const;
type Theme = (typeof THEMES)[number];

// Calibration knobs for topic matching, measured on gemini-embedding-001 (768-d) over real study notes:
// unrelated subjects score 0.68-0.77 cosine, related ones (cells vs photosynthesis) 0.83,
// the same field (data structures vs algorithms) 0.88, and two people's notes on the same subject 0.91.
export const TOPIC_UNRELATED = 0.77;
export const TOPIC_SAME = 0.92;
export const topicScore = (cosine: number) =>
  Math.min(1, Math.max(0, (cosine - TOPIC_UNRELATED) / (TOPIC_SAME - TOPIC_UNRELATED)));

type Matchable = { id: string; theme: string | null; ready: boolean; topic?: number | null };

// The world a player picks (Sports or Fantasy) is their interest: same world scores 1, otherwise 0. That also
// keeps a group's themed boss right for everyone. Free agents average it with topic similarity (`topic` =
// cosine to me, null in classes, where everyone studies the same material). Ties go to who's ready.
export function rankMatches<T extends Matchable>(me: Matchable, candidates: T[]) {
  return candidates
    .map((m) => {
      const world = Number(m.theme !== null && m.theme === me.theme);
      const topic = m.topic == null ? null : topicScore(m.topic);
      return { m, topic, score: topic == null ? world : (world + topic) / 2 };
    })
    .sort((a, b) => b.score - a.score || Number(b.m.ready) - Number(a.m.ready));
}

// Boss content for a group. accuracy = the group's phase 1 accuracy per subtopic name (0-1).
// The weakest tested subtopics become the key concepts; untested ones sort last, ties keep pack order.
export function groupConcepts(pack: Pack, accuracy: Record<string, number>): Concept[] {
  const key = pack.subtopics
    .map((s) => s.name)
    .sort((a, b) => (accuracy[a] ?? 2) - (accuracy[b] ?? 2))
    .slice(0, KEY_CONCEPTS);
  return pack.subtopics.map((s) => ({
    name: s.name,
    is_key: key.includes(s.name),
    analogy: s.analogy,
    explanation: s.lesson,
    key_points: pack.questions.filter((q) => q.subtopic === s.id).map((q) => q.explanation),
  }));
}

type ClassRow = {
  id: string; code: string; name: string; teacher_name: string; teacher_token: string;
  material: string; level: string | null; packs: Partial<Record<Theme, Pack>>;
};
type MemberRow = Matchable & {
  name: string; session_id: string | null; player_id: string | null; recent: boolean;
  group_code: string | null; group_theme: string | null; group_host: string | null; boss_started: boolean;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const materialOf = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const shortCode = () => randomBytes(3).toString("hex").toUpperCase();
type Failure = [number, string, string];
const nameError = (name: string): Failure | null => (name ? null : [400, "missing_name", "Add your name."]);
const materialError = (material: string): Failure | null =>
  !material ? [400, "missing_material", "Add the study material."]
  : material.length > MAX_MATERIAL ? [400, "material_too_long", "Keep the material under 20,000 characters."]
  : null;

export function classRouter({ db, ai }: { db: pg.Pool; ai: GoogleGenAI }) {
  const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001"; // read here: imports run before loadEnvFile()
  const pending = new Map<string, Promise<Pack>>();

  // One pack per class and world, generated once and kept in Tiger Data, so the whole class gets the
  // same subtopics and a full classroom costs at most two model calls. Concurrent first plays share one call.
  function packFor(cls: ClassRow, theme: Theme): Promise<Pack> {
    const stored = cls.packs[theme];
    if (stored) return Promise.resolve(stored);
    const key = `${cls.id}:${theme}`;
    if (!pending.has(key)) {
      pending.set(key, generatePack({
        topic: "", interest: interestFor(theme), level: cls.level ?? "high school",
        material: cls.material, playerName: "",
      })
        .then(async (pack) => {
          await db.query("UPDATE classes SET packs = packs || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1",
            [cls.id, theme, pack]);
          return pack;
        })
        // Kept on success: a request that read the class row just before the pack was stored still finds it here.
        // ponytail: every pack built since boot stays in memory; fine at hackathon scale, add an LRU if not.
        .catch((e) => {
          pending.delete(key);
          throw e;
        }));
    }
    return pending.get(key)!;
  }

  // Embeds the player's own notes, not the pack: the model themes even subtopic names ("Thylakoid Blitz
  // Drive"), which would match players by world instead of subject. Null on failure: world only.
  async function embedTopic(material: string): Promise<string | null> {
    try {
      const r = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: material.slice(0, 8000), // the model reads ~2k tokens
        config: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
      });
      const values = r.embeddings?.[0]?.values;
      return values?.length === 768 ? JSON.stringify(values) : null;
    } catch (e) {
      console.error("topic embedding failed:", e);
      return null;
    }
  }

  async function loadClass(code: string) {
    const { rows: [cls] } = await db.query<ClassRow>("SELECT * FROM classes WHERE code = $1", [code.toUpperCase()]);
    return cls ?? null;
  }

  // classId null = the free agent pool. topic = cosine similarity to the viewer (null without embeddings).
  // ponytail: loads the whole pool on every poll; filter in SQL once free agents number in the thousands.
  const roster = async (q: pg.Pool | pg.PoolClient, classId: string | null, viewerId = "") => (await q.query<MemberRow>(
    `SELECT m.id, m.name, m.theme, m.ready_at IS NOT NULL AS ready, m.session_id, m.player_id,
            COALESCE(m.ready_at, m.joined_at) > NOW() - INTERVAL '3 hours' AS recent,
            1 - (m.topic_embedding <=> v.topic_embedding) AS topic,
            s.share_code AS group_code, s.theme AS group_theme, s.content->>'host' AS group_host,
            f.session_id IS NOT NULL AS boss_started
       FROM class_members m
       LEFT JOIN class_members v ON v.id::text = $2
       LEFT JOIN sessions s ON s.id = m.session_id
       LEFT JOIN boss_fights f ON f.session_id = m.session_id
      WHERE m.class_id IS NOT DISTINCT FROM $1 ORDER BY m.joined_at`, [classId, viewerId])).rows;

  // A player's view: themselves, their group, and who they could match with.
  async function memberView(q: pg.Pool | pg.PoolClient, cls: ClassRow | null, memberId: string) {
    const all = await roster(q, cls?.id ?? null, memberId);
    const me = all.find((m) => m.id === memberId);
    if (!me) return null;
    const size = (sessionId: string | null) => all.filter((m) => sessionId && m.session_id === sessionId).length;
    const group = all.filter((m) => me.session_id && m.session_id === me.session_id);
    const open = !me.boss_started && group.length < MAX_GROUP;
    // Grouped players can add ungrouped ones; ungrouped ones can also join a group with room.
    // Free agents are suggested for 3 hours after their latest progress (signing up, then reaching the boss).
    const candidates = open ? all.filter((m) => m.id !== me.id && (cls || m.recent) && (me.session_id
      ? !m.session_id
      : !m.session_id || (size(m.session_id) < MAX_GROUP && !m.boss_started))) : [];
    return {
      member: { id: me.id, name: me.name, theme: me.theme, ready: me.ready },
      group: me.session_id ? {
        code: me.group_code, playerId: me.player_id, theme: me.group_theme, bossStarted: me.boss_started,
        members: group.map((m) => ({ id: m.id, name: m.name, theme: m.theme })),
      } : null,
      matches: rankMatches(me, candidates).map(({ m, topic, score }) => ({
        memberId: m.id, name: m.name, theme: m.theme,
        topic: topic == null ? null : Math.round(topic * 100) / 100,
        score: Math.round(score * 100) / 100, ready: m.ready, groupSize: size(m.session_id) || 1,
      })),
    };
  }

  // Every phase 1 answer goes to class_answers; reaching the boss marks the player ready to match.
  function logAnswers(classId: string | null, memberId: string) {
    const logFailed = (e: unknown) => console.error("answer log failed:", e);
    return (subtopic: string, correct: boolean, phase: string) => {
      db.query("INSERT INTO class_answers (class_id, member_id, subtopic, correct) VALUES ($1, $2, $3, $4)",
        [classId, memberId, subtopic, correct]).catch(logFailed);
      if (phase === "boss_ready")
        db.query("UPDATE class_members SET ready_at = COALESCE(ready_at, NOW()) WHERE id = $1", [memberId]).catch(logFailed);
    };
  }

  const fail = (res: express.Response, status: number, error: string, message: string) =>
    res.status(status).json({ error, message });
  const NO_CLASS = "No class with that code.";
  const NO_MEMBER = "We couldn't find that player.";

  // Match two players: start a group together, or join the partner's (or add them to yours).
  // The group's boss uses the class pack, or for free agents the pack of whoever started the group (its host).
  async function matchUp(res: express.Response, cls: ClassRow | null, memberId: unknown, partnerId: unknown) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [cls?.id ?? "free-agents"]);
      const all = await roster(client, cls?.id ?? null);
      const me = all.find((m) => m.id === memberId);
      const partner = all.find((m) => m.id === partnerId);
      const sessionId = me?.session_id ?? partner?.session_id;
      const existing = all.filter((m) => sessionId && m.session_id === sessionId);
      const error: Failure | null =
        !me || !partner || me === partner ? [404, "member_not_found", NO_MEMBER]
        : !me.ready || !partner.ready ? [409, "not_ready", "You both need to reach the boss in phase 1 first."]
        : me.session_id && partner.session_id ? [409, "already_grouped", "You're both already in groups."]
        : existing[0]?.boss_started ? [409, "boss_started", "That group's boss fight already started."]
        : existing.length >= MAX_GROUP ? [409, "group_full", `Groups have at most ${MAX_GROUP} players.`]
        : null;
      if (error) {
        await client.query("ROLLBACK");
        return fail(res, ...error);
      }
      const joining = [me!, partner!].filter((m) => !m.session_id);
      const host = existing[0]?.group_host ?? me!.id;
      const theme = (existing[0]?.group_theme ?? me!.theme) as Theme;
      const pack: Pack = cls
        ? cls.packs[theme]! // exists: me reached the boss playing it
        : (await client.query("SELECT pack FROM class_members WHERE id = $1", [host])).rows[0].pack;
      const { rows: accuracy } = await client.query(
        "SELECT subtopic, AVG(correct::int)::float AS accuracy FROM class_answers WHERE member_id = ANY($1::uuid[]) GROUP BY subtopic",
        [[...existing, ...joining].map((m) => m.id)]);
      // Recomputed on every join, which is safe because the boss hasn't started.
      const content = { host, concepts: groupConcepts(pack, Object.fromEntries(accuracy.map((a) => [a.subtopic, a.accuracy]))) };
      const id = sessionId
        ? (await client.query("UPDATE sessions SET content = $2 WHERE id = $1 RETURNING id", [sessionId, content])).rows[0].id
        : (await client.query(
          "INSERT INTO sessions (share_code, theme, level, content, class_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [shortCode(), theme, cls?.level ?? "high school", content, cls?.id ?? null])).rows[0].id;
      for (const m of joining) {
        // clock_timestamp, not NOW(): NOW() is fixed per transaction and boss.ts orders turns by joined_at.
        const { rows: [p] } = await client.query(
          "INSERT INTO players (session_id, name, joined_at) VALUES ($1, $2, clock_timestamp()) RETURNING id", [id, m.name]);
        await client.query("UPDATE class_members SET session_id = $2, player_id = $3 WHERE id = $1", [m.id, id, p.id]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json(await memberView(db, cls, memberId as string));
  }

  const router = express.Router();

  // ---------- Classes ----------

  // Teacher creates a class. The teacherToken is the only key to the dashboard: show it once, keep it.
  router.post("/api/classes", async (req, res) => {
    const name = text(req.body?.name, 100);
    const teacherName = text(req.body?.teacherName, 60);
    const material = materialOf(req.body?.material);
    if (!name || !teacherName) return fail(res, 400, "missing_fields", "Add a class name and your name.");
    const bad = materialError(material);
    if (bad) return fail(res, ...bad);
    const teacherToken = randomUUID();
    const { rows: [cls] } = await db.query<ClassRow>(
      `INSERT INTO classes (code, name, teacher_name, teacher_token, material, level)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [shortCode(), name, teacherName, teacherToken, material, text(req.body?.level, 50) || "high school"]);
    // Build both worlds now, so students don't wait for the model on their first play.
    for (const theme of THEMES)
      packFor(cls, theme).catch((e) => console.error(`class ${cls.code} ${theme} pack failed:`, e));
    res.json({ code: cls.code, name: cls.name, teacherToken });
  });

  // Teacher dashboard: roster, groups, and where the class struggles, all from Tiger Data.
  router.get("/api/classes/:code", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    if (req.get("x-teacher-token") !== cls.teacher_token)
      return fail(res, 403, "not_teacher", "Only the teacher can open the class dashboard.");
    const members = await roster(db, cls.id);
    const stats = (by: string) => db.query(
      `SELECT ${by} AS key, COUNT(*)::int AS attempts, AVG(correct::int)::float AS accuracy
         FROM class_answers WHERE class_id = $1 GROUP BY ${by} ORDER BY accuracy, key`, [cls.id]);
    const [{ rows: topics }, { rows: perMember }, { rows: groups }] = await Promise.all([
      stats("subtopic"),
      stats("member_id"),
      db.query(`SELECT s.id, s.share_code AS code, s.theme, COALESCE(f.status, 'not_started') AS boss
                  FROM sessions s LEFT JOIN boss_fights f ON f.session_id = s.id
                 WHERE s.class_id = $1 ORDER BY s.created_at`, [cls.id]),
    ]);
    res.json({
      code: cls.code, name: cls.name, teacherName: cls.teacher_name, level: cls.level,
      worldsReady: THEMES.filter((t) => cls.packs[t]),
      members: members.map((m) => {
        const s = perMember.find((p) => p.key === m.id);
        return {
          id: m.id, name: m.name, theme: m.theme, ready: m.ready, groupCode: m.group_code,
          attempts: s?.attempts ?? 0, accuracy: s?.accuracy ?? null,
        };
      }),
      groups: groups.map((g) => ({
        code: g.code, theme: g.theme, boss: g.boss,
        members: members.filter((m) => m.session_id === g.id).map((m) => m.name),
      })),
      topics: topics.map((t) => ({ subtopic: t.key, attempts: t.attempts, accuracy: t.accuracy })),
    });
  });

  router.post("/api/classes/:code/join", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    const name = text(req.body?.name, 40);
    const bad = nameError(name);
    if (bad) return fail(res, ...bad);
    const { rows: [m] } = await db.query(
      "INSERT INTO class_members (class_id, name) VALUES ($1, $2) RETURNING id, token", [cls.id, name]);
    res.json({ memberId: m.id, memberToken: m.token, class: { code: cls.code, name: cls.name, teacherName: cls.teacher_name } });
  });

  // Phase 1: same response as POST /api/game/start; then use /api/game/:gameId/next|answer|restart as usual.
  router.post("/api/classes/:code/members/:memberId/play", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    const me = (await roster(db, cls.id)).find((m) => m.id === req.params.memberId);
    if (!me) return fail(res, 404, "member_not_found", NO_MEMBER);
    const theme = req.body?.theme as Theme;
    if (!THEMES.includes(theme)) return fail(res, 400, "bad_theme", "Pick sports or fantasy.");
    let pack: Pack;
    try {
      pack = await packFor(cls, theme);
    } catch (e) {
      console.error("class pack failed:", e);
      return fail(res, 502, "upstream_failed", e instanceof LlmError ? e.message : "Couldn't build the game. Try again.");
    }
    await db.query("UPDATE class_members SET theme = $2 WHERE id = $1", [me.id, theme]);
    res.json(createGame(pack, me.name, logAnswers(cls.id, me.id)));
  });

  // Poll this (~3 s) while matching: a classmate can add you to their group at any time.
  router.get("/api/classes/:code/members/:memberId", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    const view = await memberView(db, cls, req.params.memberId);
    if (!view) return fail(res, 404, "member_not_found", NO_MEMBER);
    res.json(view);
  });

  router.post("/api/classes/:code/groups", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    await matchUp(res, cls, req.body?.memberId, req.body?.partnerId);
  });

  // ---------- Free agents ----------

  // Sign up and start phase 1 in one call: same response as POST /api/game/start, plus memberId.
  router.post("/api/free-agents", async (req, res) => {
    const name = text(req.body?.name, 40);
    const material = materialOf(req.body?.material);
    const theme = req.body?.theme as Theme;
    const bad = nameError(name) ?? materialError(material);
    if (bad) return fail(res, ...bad);
    if (!THEMES.includes(theme)) return fail(res, 400, "bad_theme", "Pick sports or fantasy.");
    let pack: Pack;
    try {
      pack = await generatePack({ topic: "", interest: interestFor(theme), level: "high school", material, playerName: name });
    } catch (e) {
      console.error("free agent pack failed:", e);
      return fail(res, 502, "upstream_failed", e instanceof LlmError ? e.message : "Couldn't build the game. Try again.");
    }
    const { rows: [m] } = await db.query(
      "INSERT INTO class_members (name, theme, pack, topic_embedding) VALUES ($1, $2, $3, $4) RETURNING id, token",
      [name, theme, pack, await embedTopic(material)]);
    res.json({ memberId: m.id, memberToken: m.token, ...createGame(pack, name, logAnswers(null, m.id)) });
  });

  // Replay phase 1 from the stored pack (e.g. after a server restart), with no model call.
  router.post("/api/free-agents/:memberId/play", async (req, res) => {
    const { rows: [m] } = await db.query(
      "SELECT id, name, pack FROM class_members WHERE id::text = $1 AND class_id IS NULL", [req.params.memberId]);
    if (!m) return fail(res, 404, "member_not_found", NO_MEMBER);
    res.json(createGame(m.pack, m.name, logAnswers(null, m.id)));
  });

  router.get("/api/free-agents/:memberId", async (req, res) => {
    const view = await memberView(db, null, req.params.memberId);
    if (!view) return fail(res, 404, "member_not_found", NO_MEMBER);
    res.json(view);
  });

  router.post("/api/free-agents/groups", (req, res) => matchUp(res, null, req.body?.memberId, req.body?.partnerId));

  // Same { error, message } shape as boss.ts for anything unexpected (DB down, bad JSON, body too big).
  router.use(["/api/classes", "/api/free-agents"], (err: { status?: number; type?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err.status) fail(res, err.status, err.type ?? "bad_request", err.message ?? "Bad request.");
    else fail(res, 500, "internal", "Something went wrong.");
  });

  return router;
}
