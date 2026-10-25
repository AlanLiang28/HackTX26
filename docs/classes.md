# Classes and matching (backend contract)

Backend for the class structure. The frontend builds on these endpoints. Code: `classes.ts`. Tables: `setup-db.ts`.

## Flow

1. **Teacher creates a class** with the study material. They get a 6-character class code to share and a private `teacherToken` for the dashboard. The server immediately builds the class's two game packs, one for Sports and one for Fantasy, in the background.
2. **Students join** with the code, their name, and their interests.
3. **Phase 1 is solo.** Each student plays the existing adaptive game (lessons and six encounters) in the world they choose. Every answer is logged to Tiger Data. Reaching the boss (`state.phase === "boss_ready"`) marks the student **ready**.
4. **Matching.** Each student gets classmates ranked by shared interests and picks one to team up with. A pick either starts a new group or joins the classmate's group. Groups hold 2 to 4 players, and both students must be ready.
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
  "members": [{ "id": "…", "name": "Ada", "interests": ["anime"], "theme": "fantasy",
                "ready": true, "groupCode": "9F3E1A" | null, "attempts": 6, "accuracy": 0.83 | null }],
  "groups": [{ "code": "9F3E1A", "theme": "fantasy", "boss": "not_started" | "active" | "defeated",
               "members": ["Ada", "Linus"] }],
  "topics": [{ "subtopic": "Mitochondria", "attempts": 14, "accuracy": 0.42 }]   // weakest first
}
```

### `POST /api/classes/:code/join` (student)

```jsonc
// request
{ "name": "Ada", "interests": ["Basketball", "anime", "cooking"] }
// 200
{ "memberId": "…", "class": { "code": "A1B2C3", "name": "Bio 101", "teacherName": "Dr. Lee" } }
```

Store `memberId`. It identifies the student on every later call. Interests are lowercased and deduplicated, with up to 10 tags of up to 40 characters each. **Matching uses exact tag overlap, so offer a fixed list of interest chips** rather than free text. Errors: `404 class_not_found`, `400 missing_name | missing_interests`.

### `POST /api/classes/:code/members/:memberId/play` (phase 1)

```jsonc
{ "theme": "sports" | "fantasy" }
```

This returns **exactly the same shape as `POST /api/game/start`**, so after it, drive the game with the existing `/api/game/:gameId/next`, `/answer`, and `/restart` (`src/lib/adaptive.ts`). It's instant when the world's pack is ready. Otherwise the first caller waits for the model, about as long as a normal game start. Call it again after a server restart, because games live in memory. Errors: `404 class_not_found | member_not_found`, `400 bad_theme`, `502 upstream_failed`.

### `GET /api/classes/:code/members/:memberId` (student status and recommendations)

**Poll this about every 3 seconds on the matching screen.** A classmate can add the student to their group at any time, and classmates become ready over time.

```jsonc
{
  "member": { "id": "…", "name": "Ada", "interests": ["anime", "basketball"], "theme": "fantasy", "ready": true },
  "group": null | {
    "code": "9F3E1A",              // boss session share code: /api/sessions/9F3E1A/boss
    "playerId": "…",               // this student's playerId for the boss routes
    "theme": "fantasy", "bossStarted": false,
    "members": [{ "id": "…", "name": "Ada", "interests": ["…"] }]
  },
  "matches": [                     // best first. Empty once the group is full or its boss started.
    { "memberId": "…", "name": "Linus", "interests": ["anime", "chess"], "shared": ["anime"],
      "score": 0.33, "ready": true, "groupSize": 1 }
  ]
}
```

Ranking is by Jaccard overlap of interests (`score`, 0 to 1), then by the same world, then by readiness. Matches include classmates who aren't ready yet (`ready: false`). Show them disabled, as "still in phase 1". `groupSize > 1` means that picking this classmate joins their existing group.

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

### Then: the boss fight

Use `group.code` and `group.playerId` with the routes in `docs/part3-boss-fight.md`. Any member calls `POST /api/sessions/:code/boss/start` once everyone is in. Players who join a group after its fight starts aren't allowed, so the roster is final.

## Data on Tiger Data

| Table | What |
|---|---|
| `classes` | Code, teacher, material, and `packs` (both worlds' game packs, **including answer keys: never sent to clients**). |
| `class_members` | Name, interests (`TEXT[]`), last world, `ready_at`, and their group (`session_id`, `player_id`). |
| `class_answers` | **Hypertable.** One row per phase 1 answer: member, subtopic, and correct. Drives the dashboard and the group's key concepts. |
| `sessions.class_id` | New column. Groups are `sessions` rows with it set. |
| `boss_attempts` | Existing hypertable. Each group's boss attempts. |

Run `npx tsx setup-db.ts` once. It's idempotent.

## Out of scope

- **Auth.** As with the boss routes, ids are trusted, and `matches` exposes classmates' `memberId`s.
- **Invite and accept.** A pick groups both students immediately.
- **Leaving a group.**
- **Semantic interest matching.** pgvector is available on the Tiger Data instance if exact tags prove too sparse.
- **A shared mob fight.** Phase 1 encounters stay solo, and only the boss is played together.
