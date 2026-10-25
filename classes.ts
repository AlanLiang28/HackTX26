// Classes. Spec: docs/classes.md
// A teacher creates a class, students join, play phase 1 (the adaptive game) on their own, then match with
// classmates who share their interests and fight the boss together. A group IS a `sessions` row plus
// `players` rows, so boss.ts's /api/sessions/:code/boss/* routes run it unchanged.
import express from "express";
import type pg from "pg";
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

type Matchable = { id: string; interests: string[]; theme: string | null; ready: boolean };

// Classmates ranked by shared interests (Jaccard), ties to the same world, then to who's ready.
// ponytail: exact tag overlap, so the UI should offer a fixed interest list; pgvector embeddings
// (the extension is available on Tiger Data) if free-text interests stop matching.
export function rankMatches<T extends Matchable>(me: Matchable, candidates: T[]) {
  const mine = new Set(me.interests);
  return candidates
    .map((m) => {
      const shared = m.interests.filter((i) => mine.has(i));
      const union = new Set([...me.interests, ...m.interests]).size;
      return { m, shared, score: union ? shared.length / union : 0 };
    })
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.m.theme === me.theme) - Number(a.m.theme === me.theme) ||
      Number(b.m.ready) - Number(a.m.ready));
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
  name: string; session_id: string | null; player_id: string | null;
  group_code: string | null; group_theme: string | null; boss_started: boolean;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const interestsOf = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((i) => text(i, 40).toLowerCase()).filter(Boolean))].slice(0, 10) : [];
const shortCode = () => randomBytes(3).toString("hex").toUpperCase();

export function classRouter({ db }: { db: pg.Pool }) {
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

  async function loadClass(code: string) {
    const { rows: [cls] } = await db.query<ClassRow>("SELECT * FROM classes WHERE code = $1", [code.toUpperCase()]);
    return cls ?? null;
  }

  const roster = async (q: pg.Pool | pg.PoolClient, classId: string) => (await q.query<MemberRow>(
    `SELECT m.id, m.name, m.interests, m.theme, m.ready_at IS NOT NULL AS ready, m.session_id, m.player_id,
            s.share_code AS group_code, s.theme AS group_theme, f.session_id IS NOT NULL AS boss_started
       FROM class_members m
       LEFT JOIN sessions s ON s.id = m.session_id
       LEFT JOIN boss_fights f ON f.session_id = m.session_id
      WHERE m.class_id = $1 ORDER BY m.joined_at`, [classId])).rows;

  // A student's view: themselves, their group, and who they could match with.
  async function memberView(q: pg.Pool | pg.PoolClient, cls: ClassRow, memberId: string) {
    const all = await roster(q, cls.id);
    const me = all.find((m) => m.id === memberId);
    if (!me) return null;
    const size = (sessionId: string | null) => all.filter((m) => sessionId && m.session_id === sessionId).length;
    const group = all.filter((m) => me.session_id && m.session_id === me.session_id);
    const open = !me.boss_started && group.length < MAX_GROUP;
    // Grouped students can add ungrouped classmates; ungrouped ones can also join a group with room.
    const candidates = open ? all.filter((m) => m.id !== me.id && (me.session_id
      ? !m.session_id
      : !m.session_id || (size(m.session_id) < MAX_GROUP && !m.boss_started))) : [];
    return {
      member: { id: me.id, name: me.name, interests: me.interests, theme: me.theme, ready: me.ready },
      group: me.session_id ? {
        code: me.group_code, playerId: me.player_id, theme: me.group_theme, bossStarted: me.boss_started,
        members: group.map((m) => ({ id: m.id, name: m.name, interests: m.interests })),
      } : null,
      matches: rankMatches(me, candidates).map(({ m, shared, score }) => ({
        memberId: m.id, name: m.name, interests: m.interests, shared,
        score: Math.round(score * 100) / 100, ready: m.ready, groupSize: size(m.session_id) || 1,
      })),
    };
  }

  const fail = (res: express.Response, status: number, error: string, message: string) =>
    res.status(status).json({ error, message });
  const NO_CLASS = "No class with that code.";
  const NO_MEMBER = "That student isn't in this class.";

  const router = express.Router();

  // Teacher creates a class. The teacherToken is the only key to the dashboard: show it once, keep it.
  router.post("/api/classes", async (req, res) => {
    const name = text(req.body?.name, 100);
    const teacherName = text(req.body?.teacherName, 60);
    const material = typeof req.body?.material === "string" ? req.body.material.trim() : "";
    if (!name || !teacherName) return fail(res, 400, "missing_fields", "Add a class name and your name.");
    if (!material) return fail(res, 400, "missing_material", "Add the study material for this class.");
    if (material.length > MAX_MATERIAL) return fail(res, 400, "material_too_long", "Keep the material under 20,000 characters.");
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
          id: m.id, name: m.name, interests: m.interests, theme: m.theme, ready: m.ready, groupCode: m.group_code,
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
    const interests = interestsOf(req.body?.interests);
    if (!name) return fail(res, 400, "missing_name", "Add your name.");
    if (!interests.length) return fail(res, 400, "missing_interests", "Pick at least one interest so we can match you.");
    const { rows: [m] } = await db.query(
      "INSERT INTO class_members (class_id, name, interests) VALUES ($1, $2, $3) RETURNING id",
      [cls.id, name, interests]);
    res.json({ memberId: m.id, class: { code: cls.code, name: cls.name, teacherName: cls.teacher_name } });
  });

  // Phase 1: same response as POST /api/game/start; then use /api/game/:gameId/next|answer|restart as usual.
  // Every answer is logged to class_answers, and reaching the boss marks the student ready to match.
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
    const logFailed = (e: unknown) => console.error("class answer log failed:", e);
    res.json(createGame(pack, me.name, (subtopic, correct, phase) => {
      db.query("INSERT INTO class_answers (class_id, member_id, subtopic, correct) VALUES ($1, $2, $3, $4)",
        [cls.id, me.id, subtopic, correct]).catch(logFailed);
      if (phase === "boss_ready")
        db.query("UPDATE class_members SET ready_at = COALESCE(ready_at, NOW()) WHERE id = $1", [me.id]).catch(logFailed);
    }));
  });

  // Poll this (~3 s) while matching: a classmate can add you to their group at any time.
  router.get("/api/classes/:code/members/:memberId", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    const view = await memberView(db, cls, req.params.memberId);
    if (!view) return fail(res, 404, "member_not_found", NO_MEMBER);
    res.json(view);
  });

  // Match with a classmate: start a group together, or join theirs (or add them to yours).
  router.post("/api/classes/:code/groups", async (req, res) => {
    const cls = await loadClass(req.params.code);
    if (!cls) return fail(res, 404, "class_not_found", NO_CLASS);
    const { memberId, partnerId } = req.body ?? {};
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [cls.id]);
      const all = await roster(client, cls.id);
      const me = all.find((m) => m.id === memberId);
      const partner = all.find((m) => m.id === partnerId);
      const sessionId = me?.session_id ?? partner?.session_id;
      const existing = all.filter((m) => sessionId && m.session_id === sessionId);
      const error: [number, string, string] | null =
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
      const theme = (existing[0]?.group_theme ?? me!.theme) as Theme;
      const pack = cls.packs[theme]!; // exists: me reached the boss playing it
      const { rows: accuracy } = await client.query(
        `SELECT subtopic, AVG(correct::int)::float AS accuracy FROM class_answers
          WHERE class_id = $1 AND member_id = ANY($2::uuid[]) GROUP BY subtopic`,
        [cls.id, [...existing, ...joining].map((m) => m.id)]);
      // Recomputed on every join, which is safe because the boss hasn't started.
      const content = { concepts: groupConcepts(pack, Object.fromEntries(accuracy.map((a) => [a.subtopic, a.accuracy]))) };
      const id = sessionId
        ? (await client.query("UPDATE sessions SET content = $2 WHERE id = $1 RETURNING id", [sessionId, content])).rows[0].id
        : (await client.query(
          "INSERT INTO sessions (share_code, theme, level, content, class_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [shortCode(), theme, cls.level, content, cls.id])).rows[0].id;
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
    res.json(await memberView(db, cls, memberId));
  });

  // Same { error, message } shape as boss.ts for anything unexpected (DB down, bad JSON, body too big).
  router.use("/api/classes", (err: { status?: number; type?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err.status) fail(res, err.status, err.type ?? "bad_request", err.message ?? "Bad request.");
    else fail(res, 500, "internal", "Something went wrong.");
  });

  return router;
}
