# StudyRaid

A single-player pixel-art study adventure built with React, TypeScript, and Vite. Choose one of two fixed worlds: **Sports** or **Fantasy**. Original characters teach concepts through dialogue, then challenge you to answer questions. The final boss asks you to explain the material yourself.

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

1. **Your world:** a dedicated screen for choosing Sports or Fantasy, with artwork and a preview of the characters.
2. **Your notes:** a separate screen for uploading TXT/Markdown or pasting up to 20,000 characters. The demo works without the backend.
3. **Adventure trail:** meet each opponent in order, then unlock the boss. Cleared encounters stay cleared when you leave a conversation.
4. **Character encounters:** each question has its own character. Read their typewriter dialogue, learn the assigned concepts, then use FIGHT to answer. LEARN repeats the explanation; NOTES opens the full reference. Incorrect answers cost 4 HP, offer coaching, and allow a retry. At 0 HP, regroup on the trail and recover.
5. **Boss:** speak or type an explanation, review it, and complete an explicit self-assessment. Opening notes does not erase the explanation.
6. **Victory:** see your first-attempt score, characters met, and questions worth reviewing. Play again or start a new adventure. Completed quests are saved on this device.

Multiplayer is deferred. There are no party, team, or room controls in the current interface.

## Character art

The project uses its existing SVG pixel-grid art system, with deliberately simple original characters. Each theme has three distinct question opponents plus a boss:

- **Fantasy:** Mossby the slime, Sir Clanks the knight, Wisp the mage, Professor Ember the dragon.
- **Sports:** Rookie Reed, Coach Dash, Coach Cross, Coach Stone.

Character art is in `src/components/PixelSprite.tsx`; personalities and lesson assignment are in `src/lib/characters.ts`. Characters retain their colors during battles, alongside crisp square pixels, monochrome dialogue boxes, heart cursors, and a four-action menu. No external character image requests are needed.

## Backend handoff

The frontend preserves `POST /api/explain` with `{ topic, interest, level }`. `interest` is derived exclusively from the two preset themes. It validates the returned session before rendering it. The expected response type and demo content are in `src/lib/study.ts`.

Backend-owned work still needed:

- AI assessment of boss explanations and follow-up questions. The current boss is explicitly labeled **practice / self-assessed**.
- Multiplayer, including rooms and synchronization, is deferred to a later version.
- PDF and slide extraction. Currently users can paste text from those formats or upload TXT/Markdown.

Speech recognition availability depends on the browser and microphone permission. Typed explanations always work. The frontend does not upload or store audio.

## Build

```sh
npm run build
```

This checks TypeScript and builds the frontend into `dist/`. The existing Express backend can serve that build.

## Artwork and fonts

Original backgrounds and their exact generation prompts are in `public/images/`. Fonts are self-hosted in `public/fonts/` with their SIL Open Font Licenses. Icons and character sprites are local SVG components. The UI respects reduced-motion preferences and supports keyboard navigation.
