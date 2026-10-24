# StudyRaid

A pixel-art study adventure built with React, TypeScript, and Vite. Choose one of two fixed worlds: **Sports** or **Fantasy**. Upload notes, study themed explanations, answer questions, and practice explaining a concept to the boss.

## Run the frontend

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. **Try a demo adventure** runs the complete experience without a backend or API keys.

For generated explanations from your own notes, also start the existing backend in another terminal:

```sh
npx tsx watch server.ts
```

The backend requires the existing environment configuration and database setup. Vite proxies `/api` requests to `http://localhost:3001`. No backend files or secrets were changed for the frontend.

## Frontend flow

1. **Prepare:** select Sports or Fantasy, upload TXT/Markdown or paste up to 20,000 characters, and choose solo or a local party of 2–4 people.
2. **Learn:** explore concept cards, themed analogies, a summary, and the analogy's limitations.
3. **Battle:** answer the generated multiple-choice questions with immediate feedback. Each teammate takes a turn.
4. **Boss:** speak using browser speech recognition or type an explanation. Review the transcript and complete an explicit self-assessment. Every teammate explains before the party finishes.
5. **Victory:** see the score, review missed questions, practice again, and save the completed quest in a device-local log.

## Backend handoff

The frontend preserves `POST /api/explain` with `{ topic, interest, level }`. `interest` is derived exclusively from the two preset themes. It validates the returned session before rendering it. The expected response type and demo content are in `src/lib/study.ts`.

Backend-owned work still needed:

- AI assessment of boss explanations and follow-up questions. The current boss is explicitly labeled **practice / self-assessed**.
- Online team rooms and synchronized multiplayer. Current team play is local, on one device.
- PDF and slide extraction. Currently users can paste text from those formats or upload TXT/Markdown.

Speech recognition availability depends on the browser and microphone permission. Typed explanations always work. The frontend does not upload or store audio.

## Build

```sh
npm run build
```

This checks TypeScript and builds the frontend into `dist/`. The existing Express backend can serve that build.

## Artwork and fonts

Original backgrounds and their exact generation prompts are in `public/images/`. Fonts are self-hosted in `public/fonts/` with their SIL Open Font Licenses. Icons and character sprites are local SVG components. The UI respects reduced-motion preferences and supports keyboard navigation.
