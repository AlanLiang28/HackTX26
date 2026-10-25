# fairytails

A pixel-art study adventure built with React, TypeScript, Vite, and Express. Study your own notes or join a classroom, learn through one of two fixed worlds (**Sports** and **Fantasy**), then explain the concepts with a small party.

## Run locally

```sh
npm install
npm run dev
```

Start the backend in another terminal:

```sh
npx tsx watch server.ts
```

Vite forwards `/api` to `http://localhost:3001`. `STUDYRAID_API_TARGET` can override that target for an isolated test server. The backend can also serve `dist/` after `npm run build`.

The backend reads local environment configuration. Keep credentials out of frontend code:

- `DATABASE_URL`: Tiger Data/Postgres connection.
- `GEMINI_API_KEY`: game-pack generation, subject embeddings, boss grading, transcription fallback, and coach audio. `GEMINI_MODEL` optionally overrides the text model.
- `GEMINI_FALLBACK_API_KEY`: optional backup key for quota failures.
- `META_API_KEY`: optional Muse voice transcription and coach script generation. `MUSE_API` works too; without either key, Gemini transcribes and writes the coach script.
- Optional model overrides are documented in `llm.ts`, `boss.ts`, and `coach.ts`.

For the new class, group, and boss tables, run `npx tsx setup-db.ts` against the intended development database. The script is idempotent and enables pgvector. This frontend integration does not run migrations or seed a connected database automatically.

## Frontend flow

The home screen has three entry points, all using the same paper panels, local pixel sprites, and minimal controls:

1. **Bring my notes.** Choose Sports or Fantasy, add a name, then upload TXT/Markdown or paste up to 20,000 characters. This starts an independent student through `/api/free-agents`. The world is also what matching uses; users cannot enter custom worlds.
2. **Join a class.** Enter the teacher's six-character code and a name. Choose a world and start the class lesson. Students share the class's cached world packs and do not need to supply notes.
3. **Teacher desk.** Create a class in two steps: class details, then study material. Choose Upload to browse or drag in a TXT/Markdown file (up to 1 MB and 20,000 characters), or choose Paste text. Switch to Paste text to review or edit uploaded material before creating the class. Save the private teacher key when it is first shown. The browser remembers classroom access; another device can open the dashboard with the class code and teacher key. The dashboard shows students, readiness, parties, and topics that need review.

Student adventures retain a **vertical foes list** and the existing character dialogue. Each run has four encounters total: three study encounters with different characters, then the final boss. Live solo rounds have three lives. Missed concepts receive priority in later questions. Every class/free-agent answer is logged by the backend.

Each solo opponent can speak its lesson, with one compact pause/play control. Live voices are prepared and cached as the adventure starts. Generated audio falls back to browser speech when unavailable; the offline demo reads its local lesson without requesting AI. Voice playback stops when leaving the lesson, and the final boss does not read out the concepts being assessed.

After the solo round, **Find a study party** opens matching. Classmates who picked the same world come first; independent students also use subject similarity. Players who are still studying are disabled. A selection immediately creates or joins a party of two to four students. Matching refreshes about every three seconds, including when another student adds you to a party.

**The shared boss** uses the group's weakest concepts. Starting closes the roster. Each player takes their turn speaking or typing an explanation; the server owns the turn, rubric, feedback, pass/fail, and victory. A failed attempt shows feedback and permits a retry. Everyone must pass every required concept and the team average must clear the server's threshold. The screen refreshes about every 1.5 seconds. Foes have no resolve or HP bars; party progress is available in a compact disclosure.

Voice recordings stop after 90 seconds, are converted to 16 kHz mono PCM WAV with `src/lib/wav.ts`, and go to the boss audio endpoint. Recording requires browser microphone permission and a supported secure context. Typed explanations work without a microphone. Browser recordings and microphone tracks are cleaned up when leaving the screen.

**Hear this lesson** in the notes panel requests the existing voice coach. It uses the selected world's analogies and the lesson's actual facts. A readable transcript and browser speech fallback remain available when generated audio is unavailable.

## Offline demo and saved progress

The notes screen's **Try a demo adventure** works without a backend, API keys, or database. It keeps three local questions, retries, and an explicitly self-assessed practice boss. It does not create a class or party, and its old themed Momentum titles are omitted.

Profiles, student identities, teacher access keys, completed quests, and a completed solo-round recap are saved on this device when browser storage permits. **Continue as…** restores matching for ready students, and an open solo round can be continued while the page remains open. After a reload or server restart, an unfinished solo round restarts from the stored backend pack through `/play`; the server does not offer an in-progress snapshot endpoint. Groups and boss results remain on the backend. Reopening a completed party updates its quest-log entry rather than duplicating it.

## Contracts and implementation

- [Classes, free agents, and matching](docs/classes.md)
- [Shared boss fight](docs/part3-boss-fight.md)
- `src/lib/classroom.ts`: class, independent student, dashboard, identity storage, and matching clients.
- `src/lib/party.ts`: boss polling, start, text, and WAV submission clients.
- `src/lib/adaptive.ts`: the shared solo-game client and response validation.
- `src/lib/usePolling.ts`: serial polling with cancellation on navigation and pauses in hidden tabs.
- `src/lib/voice.ts`: shared concept-voice requests and prefetch cache.

Game packs and answer keys remain server-owned. Lessons reach the browser when a round starts; a question's answer key is returned only after grading. Incorrect network retries are not counted as extra answers.

Authentication, leaving a party, and shared mob fights are outside the backend contract. The frontend does not add those actions. Joshua's standalone `Game.tsx` remains as source but is not mounted.

## Checks

```sh
npm run build
npm test
```

The build checks frontend TypeScript and produces `dist/`. Tests cover adaptive selection, request retries, backend boss rules, world/subject matching, frontend API contracts, human-readable errors, teacher headers, WAV/text body formats, and quest-log deduplication. They do not need real credentials or a database.

For browser QA without external services, `node --import tsx tests/fixtures/community-preview.ts` starts an isolated API on port 3101, using the real adaptive routes and boss state calculation with deterministic fixture data. Point a separate Vite preview at it with `STUDYRAID_API_TARGET=http://127.0.0.1:3101`. That server is a test fixture and is never imported by the production app.

## Art and accessibility

Full-page pixel backgrounds, their prompts, and portrait battle variants are in `public/images/`. Character art is in `src/components/PixelSprite.tsx`, and personalities are in `src/lib/characters.ts`. Fonts are self-hosted in `public/fonts/` with their SIL Open Font Licenses. The interface supports keyboard focus, reduced motion, narrow screens, and immediate return from encounters to the trail.
