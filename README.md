# StudyRaid

A single-player pixel-art study adventure built with React, TypeScript, and Vite. Choose one of two fixed worlds: **Sports** or **Fantasy**. Original characters teach concepts through dialogue, then challenge you to answer questions. The final boss asks you to explain the material yourself.

## Run the frontend

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. **Try a demo adventure** runs the complete experience without a backend or API keys.

For adaptive adventures from your own notes, also start the backend in another terminal:

```sh
npx tsx watch server.ts
```

The backend requires the existing environment configuration and database setup. Set `GEMINI_API_KEY` for Gemini. `GEMINI_MODEL` is an optional override (defaults to `gemini-3.5-flash`). Vite proxies `/api` requests to `http://localhost:3001`. Keep credentials in your local environment.

## Frontend flow

1. **Your world:** a dedicated screen for choosing Sports or Fantasy, with artwork and a preview of the characters.
2. **Your notes:** a separate screen for uploading TXT/Markdown or pasting up to 20,000 characters. The demo works without the backend.
3. **Adventure trail:** meet each opponent in order, then unlock the boss. Cleared encounters stay cleared when you leave a conversation.
4. **Character encounters:** read the character's typewriter lesson, then choose an answer directly. Live quests have six encounters and three lives. Each answer updates topic proficiency, and missed concepts get priority in the next questions. Coaching explains the answer before you continue. Three misses end the run with a review and restart option. The offline demo keeps its original three questions, 4 HP penalty, and retries. The small encounter menu contains lesson review, notes, and returning to the trail.
5. **Boss:** the live boss focuses on your weakest tested concept. Speak or type an explanation, review it, and complete an explicit self-assessment. Opening notes does not erase the explanation.
6. **Victory:** see your first-attempt score, characters met, and questions worth reviewing. Play again or start a new adventure. Completed quests are saved on this device.

The interface is single-player for now. The backend for classes and group play is ready: see [Classes and matching](docs/classes.md).

## Character art

The project uses its existing SVG pixel-grid art system, with deliberately simple original characters. Each theme has three distinct question opponents plus a boss:

- **Fantasy:** Mossby the slime, Sir Clanks the knight, Wisp the mage, Professor Ember the dragon.
- **Sports:** Rookie Reed, Coach Dash, Coach Cross, Coach Stone.

Character art is in `src/components/PixelSprite.tsx`; personalities and lesson assignment are in `src/lib/characters.ts`. Characters retain their colors during battles, alongside crisp square pixels, monochrome dialogue boxes, heart cursors, and a minimal contextual interface. No external character image requests are needed.

## Backend handoff

The existing frontend now uses Joshua's `game-routes.ts` API through `src/lib/adaptive.ts`. The Sports/Fantasy choice supplies the preset theme; users cannot enter custom themes. The older `POST /api/explain`, history, and stats endpoints remain available. Joshua's standalone `Game.tsx` is retained as source but is not mounted in this frontend.

- `POST /api/game/start` builds the lessons and question bank with one Gemini call (malformed model output may trigger one retry). Only lessons and game metadata reach the browser initially.
- `POST /api/game/:gameId/next` selects an unanswered question using smoothed proficiency `(correct + 1) / (attempts + 2)`. Weaker topics take priority, ties favor fewer attempts, and fresh questions are exhausted before repeats. Reopening an unanswered encounter returns the same question.
- `POST /api/game/:gameId/answer` grades on the server, records topic performance, and returns the answer explanation. The frontend includes the question ID so retrying a failed network request does not deduct another life.
- `POST /api/game/:gameId/restart` resets the run using the same pack, without another model call.

Games are held in server memory, with stale games cleaned up when another game starts (three-hour threshold). Server restarts discard active runs. Quest history in this frontend remains local to the device.

**Classes** (`classes.ts`, [docs/classes.md](docs/classes.md)): a teacher creates a class from their material, and students join with a code and their interests. Students play phase 1 alone, with every answer logged to Tiger Data. They then match with classmates who share their interests and fight the boss together. **Free agents** (no class) bring their own notes and are matched with other free agents on interests and topic, using pgvector embeddings. A group is a regular boss session, so `boss.ts` runs it unchanged. Its key concepts are the group's weakest subtopics.

Backend-owned work still needed:

- AI assessment of boss explanations and follow-up questions. The current boss is explicitly labeled **practice / self-assessed**.
- Frontend screens for classes, matching, and the group boss fight (the backend is in `classes.ts` and `boss.ts`).
- PDF and slide extraction. Currently users can paste text from those formats or upload TXT/Markdown.

Speech recognition availability depends on the browser and microphone permission. Typed explanations always work. The frontend does not upload or store audio.

## Build

```sh
npm run build
npm test
```

The build checks frontend TypeScript and produces `dist/`, which Express can serve. Tests exercise the actual game routes with deterministic model output, including performance-based selection, answer-key privacy, request retries, game-over, boss readiness, and restart. Tests do not call Meta or require real credentials or a database.

## Artwork and fonts

Original backgrounds and their exact generation prompts are in `public/images/`. Fonts are self-hosted in `public/fonts/` with their SIL Open Font Licenses. Icons and character sprites are local SVG components. The UI respects reduced-motion preferences and supports keyboard navigation.
