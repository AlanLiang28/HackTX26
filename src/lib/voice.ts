// AI coach voices for game concepts: one /api/coach call per concept, cached for the page's lifetime.
// prefetchVoices() makes them all when a game begins, so each encounter's voice is usually ready on arrival.
import type { Mapping } from "./study";

export type CoachReply = { script: string; audioBase64: string | null; mimeType: string };

const cache = new Map<string, Promise<CoachReply>>();

// What the coach must cover; also what the browser reads aloud if the voice can't be made.
export const conceptFacts = (c: Mapping) => `${c.concept}: like ${c.analogy}. ${c.explanation}`;

// The request body doubles as the cache key.
const voiceKey = (title: string, interest: string, c: Mapping) =>
  JSON.stringify({ topic: `${c.concept} (part of ${title})`, interest, facts: [conceptFacts(c)] });

export function fetchConceptVoice(title: string, interest: string, c: Mapping) {
  const key = voiceKey(title, interest, c);
  let reply = cache.get(key);
  if (!reply) {
    reply = fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.script) throw new Error(data?.error ?? "No voice available.");
      return data as CoachReply;
    });
    reply.catch(() => cache.delete(key)); // let the encounter retry
    cache.set(key, reply);
  }
  return reply;
}

// Two at a time keeps the first voices fast without tripping the per-minute limit.
// Starting a new game stops the previous game's queue and frees its audio (a few MB per voice).
let generation = 0;
export function prefetchVoices(title: string, interest: string, concepts: Mapping[], parallel = 2) {
  const run = ++generation;
  const keep = new Set(concepts.map((c) => voiceKey(title, interest, c)));
  for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
  const queue = [...concepts];
  const worker = async () => {
    while (run === generation && queue.length) {
      await fetchConceptVoice(title, interest, queue.shift()!).catch(() => {});
    }
  };
  for (let i = 0; i < parallel; i++) void worker();
}
