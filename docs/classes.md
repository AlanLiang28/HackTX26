# Classes, free agents, and matching (backend contract)

Backend for the class structure and for free agents (players without a class, matched on world and topic; see [Free agents](#free-agents)). The frontend builds on these endpoints. Code: `classes.ts`. Tables: `setup-db.ts`.

## Flow

1. **Teacher creates a class** with the study material. They get a 6-character class code to share and a private `teacherToken` for the dashboard. The server immediately builds the class's two game packs, one for Sports and one for Fantasy, in the background.
2. **Students join** with the code and their name. Their world (Sports or Fantasy) is their interest for matching.
3. **Phase 1 is solo.** Each student plays the existing adaptive game (lessons and six encounters) in the world they choose. Every answer is logged to Tiger Data. Reaching the boss (`state.phase === "boss_ready"`) marks the student **ready**.
4. **Matching.** Each student gets classmates ranked by world, with classmates in the same world first, and picks one to team up with. A pick either starts a new group or joins the classmate's group. Groups hold 2 to 4 players, and both students must be ready.
5. **Game phase together.** A group is a normal boss session, so the group plays the existing multiplayer boss fight (`docs/part3-boss-fight.md`) using its `group.code` and each member's `group.playerId`. The boss's key concepts are the **group's two weakest subtopics** from phase 1.

The whole class shares one pack per world, so every student gets the same subtopics, and a class costs at most two model calls, however many students it has.

## Endpoints

Errors use `{ "error": "<code>", "message": "<human text>" }`, the same shape as the boss routes. Show `message`.

### `POST /api/classes` (teacher)

```jsonc
// request
{ "name": "Bio 101", "teacherName": "Dr. Lee", "material": "…notes, up to 20,000 chars…", "level": "intro college" }
// 200
{ "code": "A1B2C3", "name": "Bio 101", "teacherToken": "…" }
```

**Show `teacherToken` once and store it** (for example, in `localStorage`). It's the only way into the dashboard. `level` is optional and defaults to `"high school"`. This route is rate-limited like the other AI routes. Errors: `400 missing_fields | missing_material | material_too_long`.

### `GET /api/classes/:code` (teacher dashboard)

Send the header `X-Teacher-Token: <teacherToken>`. A wrong or missing token returns `403 not_teacher`.

```jsonc
{
  "code": "A1B2C3", "name": "Bio 101", "teacherName": "Dr. Lee", "level": "intro college",
  "worldsReady": ["sports", "fantasy"],          // packs built; students can start phase 1 instantly
  "worldErrors": { "fantasy": "…" },             // worlds not building right now, and why; a student picking one retries it
  "members": [{ "id": "…", "name": "Ada", "theme": "fantasy",
                "ready": true, "groupCode": "9F3E1A" | null, "attempts": 6, "accuracy": 0.83 | null }],
  "groups": [{ "code": "9F3E1A", "theme": "fantasy", "boss": "not_started" | "active" | "defeated",
               "members": ["Ada", "Linus"] }],
  "topics": [{ "subtopic": "Mitochondria", "attempts": 14, "accuracy": 0.42 }]   // weakest first
}
```

### `POST /api/classes/:code/join` (student)

```jsonc
// request
{ "name": "Ada" }
// 200
{ "memberId": "…", "memberToken": "…", "class": { "code": "A1B2C3", "name": "Bio 101", "teacherName": "Dr. Lee" } }
```

Store `memberId` and `memberToken`. `memberId` identifies the student on every later call, and every member route (`/play`, the status poll, groups, and the free-agent versions) also needs the header `X-Member-Token: <memberToken>`, because member ids show up in classmates' match lists. A wrong or missing token returns `403 not_member`. There's no interest picker: the world they choose when they play (`/play`) is what matching uses. Errors: `404 class_not_found`, `400 missing_name`.

### `POST /api/classes/:code/members/:memberId/play` (phase 1)

```jsonc
{ "theme": "sports" | "fantasy" }
```

This returns **exactly the same shape as `POST /api/game/start`**, so after it, drive the game with the existing `/api/game/:gameId/next`, `/answer`, and `/restart` (`src/lib/adaptive.ts`). It's instant when the world's pack is ready. Otherwise the first caller waits for the model, about as long as a normal game start. Call it again after a server restart, because games live in memory. Errors: `404 class_not_found | member_not_found`, `400 bad_theme`, `502 upstream_failed`.

### `GET /api/classes/:code/members/:memberId` (student status and recommendations)

**Poll this about every 3 seconds on the matching screen.** A classmate can add the student to their group at any time, and classmates become ready over time.

```jsonc
{
  "member": { "id": "…", "name": "Ada", "theme": "fantasy", "ready": true },
  "group": null | {
    "code": "9F3E1A",              // boss session share code: /api/sessions/9F3E1A/boss
    "playerId": "…",               // this student's playerId for the boss routes
    "theme": "fantasy", "bossStarted": false,
    "members": [{ "id": "…", "name": "Ada", "theme": "fantasy" }]
  },
  "matches": [                     // best first. Empty once the group is full or its boss started.
    { "memberId": "…", "name": "Linus", "theme": "fantasy" | "sports" | null,  // null: hasn't played yet
      "topic": null,               // always null in classes; set for free agents
      "score": 1, "ready": true, "groupSize": 1 }
  ]
}
```

Ranking is by world: `score` is 1 for the same world as you, else 0, with ties going to whoever is ready. Same-world groups also keep the group's themed boss right for everyone. Matches include classmates who aren't ready yet (`ready: false`). Show them disabled, as "still in phase 1". `groupSize > 1` means that picking this classmate joins their existing group.

### `POST /api/classes/:code/groups` (match)

```jsonc
// request
{ "memberId": "<me>", "partnerId": "<match.memberId>" }
// 200: the same shape as GET /api/classes/:code/members/:memberId, now with "group" set
```

- If neither student is grouped, this creates a group with both of them.
- If one of them is grouped, the other joins that group.
- Errors: `404 member_not_found`, `409 not_ready | already_grouped | boss_started | group_full`.

Each time a member joins, the boss's key concepts are recomputed from the whole group's phase 1 answers.

## Free agents

A free agent is a player who isn't in a class. They bring their own notes, play phase 1 alone, and are then recommended to other free agents in the same **world** who study a similar **topic**, so they can play the game phase together. The routes and response shapes match the class routes, so the same matching screen works for both.

1. `POST /api/free-agents` signs them up and starts phase 1 in one call (one model call). It's rate-limited like the other AI routes.

   ```jsonc
   // request
   { "name": "Ada", "theme": "sports" | "fantasy", "material": "…notes, up to 20,000 chars…" }
   // 200: the same shape as POST /api/game/start, plus memberId
   { "memberId": "…", "memberToken": "…", "gameId": "…", "playerId": "…", "pack": { … }, "state": { … } }
   ```

   Store `memberId` and `memberToken` (send it as `X-Member-Token` on the routes below), then drive the game with `/api/game/:gameId/next`, `/answer`, and `/restart`. Errors: `400 missing_name | missing_material | material_too_long | bad_theme`, `502 upstream_failed`.

2. `POST /api/free-agents/:memberId/play` replays phase 1 from their stored pack, with no model call. Use it after a server restart.
3. `GET /api/free-agents/:memberId` returns the same `{ member, group, matches }` view as the class version. Poll it about every 3 seconds while matching.
4. `POST /api/free-agents/groups` takes `{ "memberId": "<me>", "partnerId": "<match.memberId>" }` and has the same rules and errors as class groups.

**Ranking:** `score = (same world + topic) / 2`, where same world is 1 or 0. `topic` (0 to 1) is how close the two players' subjects are. It compares embeddings of the players' own notes (Gemini `gemini-embedding-001`, stored in pgvector). World and subject weigh the same, so a Fantasy player with your exact subject ties a Sports player studying something unrelated. Measured on real notes: two people's notes on the same subject score about 0.93, the same field (data structures vs algorithms) about 0.7, related subjects (cells vs photosynthesis) about 0.4, and unrelated ones 0. If the embedding call fails at signup, that player's `topic` is `null` and they're ranked on world only. To tune it, adjust `TOPIC_UNRELATED` and `TOPIC_SAME` in `classes.ts`.

**Whose notes the group plays:** the boss uses the pack of the player who **started the group** (the one who sent `memberId` when neither was grouped). Key concepts are still the group's weakest subtopics, from whoever answered questions on that pack. Topic matching is what makes a shared pack fair.

**Freshness:** free agents are suggested for 3 hours after their latest progress, meaning signing up or reaching the boss. After that they can still use their own routes, but they no longer appear in other players' matches.

### Then: the boss fight

Use `group.code` and `group.playerId` with the routes in `docs/part3-boss-fight.md`. Any member calls `POST /api/sessions/:code/boss/start` once everyone is in. Players who join a group after its fight starts aren't allowed, so the roster is final.

## Data on Tiger Data

| Table | What |
|---|---|
| `classes` | Code, teacher, material, and `packs` (both worlds' game packs, **including answer keys: never sent to clients**). |
| `class_members` | Name, world (`theme`, which is also what matching uses), `ready_at`, and their group (`session_id`, `player_id`). Free agents are rows with `class_id` null, plus their own `pack` and `topic_embedding vector(768)` (pgvector). |
| `class_answers` | **Hypertable.** One row per phase 1 answer: member, subtopic, and correct (`class_id` null for free agents). Drives the dashboard and the group's key concepts. |
| `sessions.class_id` | New column. Class groups are `sessions` rows with it set. It's null for free-agent groups, and `content.host` names the member whose pack the group plays. |
| `boss_attempts` | Existing hypertable. Each group's boss attempts. |

Run `npx tsx setup-db.ts` once. It's idempotent, and it enables the `vector` extension. Embeddings use `GEMINI_API_KEY` (and `GEMINI_EMBED_MODEL` to override the model).

## Demo data

`npx tsx seed-demo.ts` seeds synthetic data, and `--clean` removes it:

- 4 professors and their classes. Codes are `BIO101`, `CS1332`, `ECO304`, and `HIS315`, and teacher tokens are `demo-<code in lowercase>`.
- 50 students and 18 free agents, with phase 1 answers, groups, and boss fights that are not started, in progress, or defeated.

It prints a cheat sheet of personas and their ids. The ids stay the same across re-runs. Re-run it shortly before recording, because free agents drop out of suggestions 3 hours after their latest progress. Game packs come from the real model once and are cached in `seed-demo-packs.json`, so re-runs make no model calls.

## Out of scope

- **Auth.** As with the boss routes, ids are trusted, and `matches` exposes classmates' `memberId`s.
- **Invite and accept.** A pick groups both students immediately.
- **Leaving a group.**
- **A shared mob fight.** Phase 1 encounters stay solo, and only the boss is played together.
