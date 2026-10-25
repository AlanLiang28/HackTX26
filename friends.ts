// Friends and chat between players (class_members rows, so class members and free agents alike).
// A friendship is two `friends` rows, one per direction; a lone row is a request the other player accepts by
// adding them back. Every route needs the player's X-Member-Token: member ids show up in match lists, tokens never do.
import express from "express";
import type pg from "pg";

const MAX_MESSAGE = 500;
const CHAT_HISTORY = 100;

export function friendRouter({ db }: { db: pg.Pool }) {
  const router = express.Router();
  const fail = (res: express.Response, status: number, error: string, message: string) =>
    res.status(status).json({ error, message });

  // The player's id when the token matches, else null (and a 403 sent).
  async function me(req: express.Request, res: express.Response) {
    const { rows: [m] } = await db.query<{ id: string }>(
      "SELECT id FROM class_members WHERE id::text = $1 AND token::text = $2",
      [req.params.memberId, req.get("x-member-token") ?? ""]);
    if (!m) fail(res, 403, "not_member", "Rejoin to see your friends.");
    return m?.id ?? null;
  }

  // status: "friends" both ways, "incoming" they added me, "outgoing" I added them.
  async function friendsView(memberId: string) {
    const { rows } = await db.query(
      `SELECT m.id, m.name,
              CASE WHEN COUNT(*) = 2 THEN 'friends' WHEN bool_or(f.member_id = $1) THEN 'outgoing' ELSE 'incoming' END AS status
         FROM friends f
         JOIN class_members m ON m.id = CASE WHEN f.member_id = $1 THEN f.friend_id ELSE f.member_id END
        WHERE $1 IN (f.member_id, f.friend_id)
        GROUP BY m.id, m.name ORDER BY m.name`, [memberId]);
    return { friends: rows };
  }

  // Newest first, so the client can pin the log to the bottom with CSS.
  // ponytail: resends the last 100 messages every poll; add a since cursor if chats get long.
  async function chatView(memberId: string, friendId: string) {
    const { rows } = await db.query(
      `SELECT id, from_id = $1 AS mine, body, created_at AS at FROM messages
        WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)
        ORDER BY created_at DESC LIMIT ${CHAT_HISTORY}`, [memberId, friendId]);
    return { messages: rows };
  }

  // Chat is for mutual friends only. ::text so a malformed id is just "not friends", not a cast error.
  const areFriends = async (memberId: string, friendId: string) => (await db.query(
    `SELECT 1 FROM friends WHERE (member_id = $1 AND friend_id::text = $2) OR (member_id::text = $2 AND friend_id = $1)`,
    [memberId, friendId])).rowCount === 2;

  router.get("/api/members/:memberId/friends", async (req, res) => {
    const id = await me(req, res);
    if (id) res.json(await friendsView(id));
  });

  // Add a friend, or accept their request (same thing). Repeats are harmless.
  router.post("/api/members/:memberId/friends", async (req, res) => {
    const id = await me(req, res);
    if (!id) return;
    const { rows: [friend] } = await db.query<{ id: string }>(
      "SELECT id FROM class_members WHERE id::text = $1 AND id <> $2", [String(req.body?.friendId ?? ""), id]);
    if (!friend) return fail(res, 404, "member_not_found", "We couldn't find that player.");
    await db.query("INSERT INTO friends (member_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, friend.id]);
    res.json(await friendsView(id));
  });

  router.get("/api/members/:memberId/friends/:friendId/messages", async (req, res) => {
    const id = await me(req, res);
    if (!id) return;
    if (!(await areFriends(id, req.params.friendId)))
      return fail(res, 403, "not_friends", "You can only chat with friends.");
    res.json(await chatView(id, req.params.friendId));
  });

  router.post("/api/members/:memberId/friends/:friendId/messages", async (req, res) => {
    const id = await me(req, res);
    if (!id) return;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return fail(res, 400, "missing_body", "Write a message first.");
    if (body.length > MAX_MESSAGE) return fail(res, 400, "message_too_long", `Keep messages under ${MAX_MESSAGE} characters.`);
    if (!(await areFriends(id, req.params.friendId)))
      return fail(res, 403, "not_friends", "You can only chat with friends.");
    await db.query("INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3)", [id, req.params.friendId, body]);
    res.json(await chatView(id, req.params.friendId));
  });

  // Same { error, message } shape as classes.ts for anything unexpected.
  router.use("/api/members", (err: { status?: number; type?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err.status) fail(res, err.status, err.type ?? "bad_request", err.message ?? "Bad request.");
    else fail(res, 500, "internal", "Something went wrong.");
  });

  return router;
}
