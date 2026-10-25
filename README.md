# fairytails

**Study alone, then prove you know it together.** fairytails turns your notes into a pixel-art adventure. You learn through a world you like (Sports or Fantasy), fight through three study encounters, then team up with classmates for a boss fight where *you have to explain the material out loud*. The boss only falls if every teammate passes, so nobody can coast.

Built at HackTX 26. (The site's password prompt says "StudyRaid", the project's working name.)

## Why we built it

Re-reading notes feels like studying but doesn't test anything. Teaching a concept is the best check that you understand it, but it's hard to find a study partner at the right level. fairytails does both: an AI tutor explains your notes using analogies from a world you care about, adapts to what you miss, and then matches you with a party to explain the weakest concepts to each other.

## Quick start

You need **Node 20.12+** (we used Node 24). Check with `node -v`.

```sh
git clone git@github.com:AlanLiang28/HackTX26.git
cd HackTX26
npm install
```

### Option A: Offline demo (no keys, no database, 1 minute)

```sh
npm run dev
```

Open http://localhost:5173 and click **Try a demo adventure** on the notes screen. This runs entirely in the browser with three canned questions. It is a good smoke test, but it doesn't show classes, matching, or the shared boss.

### Option B: The full app

1. **Create a `.env` file** in the project root (it is git-ignored):

   ```sh
   DATABASE_URL=postgres://...      # Tiger Data (Postgres) connection string. Required.
   GEMINI_API_KEY=...               # Google AI Studio key. Required.
   MUSE_API=...                     # Meta Muse key. Optional (META_API_KEY also works). Without it, Gemini does everything.
   GEMINI_FALLBACK_API_KEY=...      # Optional second Gemini key, used when the first runs out of quota.
   GEMINI_MODEL=...                 # Optional model overrides, see llm.ts.
   GEMINI_FALLBACK_MODEL=...
   SITE_PASSWORD=...                # Optional. Puts a password on the whole site. Leave unset locally.
   PORT=3001                        # Optional. Backend port.
   ```

2. **Create the database tables** (safe to run more than once; it also turns on pgvector):

   ```sh
   npx tsx setup-db.ts
   ```

3. **(Optional) Load demo data**: professors, classes, students, free agents, parties and boss fights, so every screen has something to show:

   ```sh
   npx tsx seed-demo.ts            # wipe and reseed
   npx tsx seed-demo.ts --clean    # only wipe
   ```

   Re-run it right before presenting. Free agents are only suggested for matching for 3 hours after they sign up.

4. **Start the backend** in one terminal:

   ```sh
   npx tsx watch server.ts
   ```

5. **Start the frontend** in another:

   ```sh
   npm run dev
   ```

6. Open http://localhost:5173. Vite forwards every `/api` request to the backend on port 3001.

### Run it like production

```sh
npm run build          # type-checks and builds the site into dist/
npx tsx server.ts      # the backend now serves dist/ too, all on http://localhost:3001
```

## Walkthrough

There are three ways in from the home screen.

**1. Bring my notes (a solo student).** Pick a world, enter a name, then upload a PDF, TXT or Markdown file, or paste text (up to 20,000 characters). The AI reads it, splits it into subtopics, and builds your adventure.

**2. Join a class (a student).** Enter the teacher's 6-character code and your name, pick a world, and play the class lesson. You don't need your own notes.

**3. Teacher desk.** Create a class in two steps: class details, then study material (upload or paste). You get a class code to share and a **private teacher key. Save it when it's shown**, because it's the only way back into the dashboard from another device. The dashboard shows students, who's ready, parties, and the topics the class struggles with.

### What a student plays

1. **Three study encounters.** Each foe is a different character who teaches one concept through the world's analogies (a quarterback calling plays instead of a nucleus directing the cell), then quizzes you. You have three lives. Concepts you miss come back more often. Every foe can speak its lesson aloud, and the speaker button in the corner mutes everything.
2. **The final boss, solo.** Prove it with what you've learned. When you reach it you're marked **ready**.
3. **Find a study party.** Matching shows classmates in your world first. Independent students are also ranked by how similar their subject is. You can form a party of 2 to 4.
4. **The shared boss fight.** The party's two weakest concepts become the boss's questions. Players take turns **explaining a concept out loud** (or typing it). The server transcribes and grades each explanation against a rubric. A fail gives feedback and a retry, with a hint after three misses. The boss falls only when **every player has passed every concept and the team average clears 75%**.

### A 2-minute demo script

1. Teacher desk: paste notes, create a class, show the class code.
2. Join as a student in a second browser window, pick Fantasy, play the first encounter, let a character speak.
3. Join as a second student, finish the solo round, open **Find a study party**, pick the first student.
4. Start the boss. Student 1 explains a concept by voice and passes. Student 2 misses, sees the feedback, retries.
5. Back on the teacher dashboard: readiness, the party, and the weak topics.

## How it works

```
Browser (React + Vite)
   │  /api/*
   ▼
Express server (server.ts)
   ├─ site password, rate limits, daily AI budget
   ├─ game-routes.ts  the solo adventure: builds a "pack", then runs with no AI latency
   ├─ classes.ts      classes, free agents, matching
   ├─ boss.ts         the shared boss fight and grading rules
   ├─ friends.ts      friends and chat
   ├─ coach.ts        AI voice for lessons
   └─ llm.ts          the one place that calls text models
        │                      │
        ▼                      ▼
   Tiger Data (Postgres      Muse (Meta) → Gemini
   + pgvector)               text, PDF reading, transcription,
                             embeddings, speech
```

The ideas worth knowing:

- **One AI call builds the whole game.** When a class or solo student is created, the server asks the model for a *pack*: subtopics, themed enemies, a boss, and a bank of questions. After that the game runs with no AI latency. A class builds two packs (Sports and Fantasy), so a class costs at most two model calls however many students join.
- **The server owns the answer key.** The browser never sees a correct answer until after it has answered, so it can't be read from the network tab. Every class and solo answer is logged to the database.
- **Code decides pass or fail, not the AI.** The model only scores the rubric (correctness out of 4, total out of 16). Fixed rules in `boss.ts` decide the result: correctness 3 or more, total 11 or more, and a team average of 0.75. That makes grading consistent and hard to talk your way around.
- **Boss state is never stored.** It's recomputed from the list of attempts and the roster on every read. That avoids sync bugs, and the screen simply polls every 1.5 seconds.
- **Matching uses embeddings.** The subject of each student's notes is embedded with Gemini and stored with pgvector. Classmates in the same world come first, then closeness of subject.
- **Models can fail over.** `llm.ts` tries Muse first, then Gemini with a backup key and a lighter backup model, so one overloaded or out-of-quota provider doesn't stop the game.
- **Voice in, voice out.** Recordings (max 90 s) are converted in the browser to 16 kHz mono WAV, then transcribed on the server. Lesson audio uses Gemini speech and falls back to browser speech if that fails.

## Tech stack

| Layer | What we used |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, hand-made pixel-art sprites and CSS (no UI library) |
| Backend | Node, Express 5, `tsx` (runs TypeScript directly) |
| Database | Tiger Data (Postgres) with pgvector for subject matching |
| AI | Meta Muse for text and transcription; Google Gemini for fallback text, PDF reading, embeddings and speech |
| Tests | Node's built-in test runner |

## Project map

| Path | What's in it |
| --- | --- |
| `server.ts` | Entry point: middleware, rate limits, route mounting, serves `dist/` |
| `game-routes.ts` | Solo adventure and adaptive question selection |
| `classes.ts` | Classes, free agents, matching |
| `boss.ts` | Shared boss fight: rubric, transcription, state |
| `llm.ts`, `coach.ts` | Model calls with fallback; AI voice |
| `friends.ts` | Friends and chat |
| `setup-db.ts` | Creates all tables (idempotent) |
| `seed-demo.ts`, `seed-demo-packs.json` | Demo data and its cached game packs |
| `src/App.tsx`, `src/components/` | The UI screens |
| `src/lib/` | API clients, polling, WAV encoding, characters, study helpers |
| `public/images/` | Pixel backgrounds, with the prompts used to make them |
| `docs/` | Detailed API contracts (see below) |

## Safeguards

Because this runs on paid AI keys and might be shown to many people:

- **Per-visitor limits** on AI routes: 5 per minute and 40 per day. Voice routes: 12 per minute and 100 per day.
- **A site-wide daily budget**: 300 AI calls and 1000 voice calls, after which the API says to try tomorrow.
- **Optional site password** (`SITE_PASSWORD`) covering every page and API route.
- **Teacher keys and member tokens** protect dashboards and friends. API keys live only on the server.
- Errors always come back as readable JSON, never a stack trace.

## Tests and checks

```sh
npm test         # 47 tests, no keys or database needed
npm run build    # type-checks and builds
npm run lint
```

For clicking through the UI without any external service, the project includes a fixture API:

```sh
node --import tsx tests/fixtures/community-preview.ts          # fake API on port 3101
STUDYRAID_API_TARGET=http://127.0.0.1:3101 npx vite --port 5174
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Backend crashes at startup | `.env` is missing or has no `DATABASE_URL`. |
| "relation ... does not exist" | Run `npx tsx setup-db.ts`. |
| Generating a game fails or hangs | Check `GEMINI_API_KEY` and quota. Add `GEMINI_FALLBACK_API_KEY` as a backup. |
| "Slow down!" or "daily limit" | The rate limits above. Restarting the backend resets the counters. |
| Gemini auth errors when running locally | Unset `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` in your shell before starting the backend. |
| Mic doesn't work | The browser needs microphone permission and `localhost` or HTTPS. Typing an explanation works without it. |
| `/api` calls fail from the frontend | The backend isn't running on port 3001, or set `STUDYRAID_API_TARGET`. |
| Matching shows nobody | Other students must have finished their solo round (be "ready"). Re-run `seed-demo.ts` for demo data. |

## Limitations and what's next

- Only two worlds, Sports and Fantasy. Space and Cooking are shown as "coming soon".
- No real accounts: identity is a token saved in the browser, and teachers use a private key.
- Leaving a party and shared mob fights aren't built.
- A solo round in progress restarts after a refresh or server restart; groups and boss results are kept.
- Daily limits are counted in server memory and reset on restart.

## More detail

- [Frontend and feature details](docs/frontend.md): every screen and behavior
- [Classes, free agents, and matching](docs/classes.md): API contract
- [Shared boss fight](docs/part3-boss-fight.md): API contract and grading rules
- [Art prompts and credits](public/images/README.md). Fonts (DM Sans, Pixelify Sans) are self-hosted under the SIL Open Font License.
