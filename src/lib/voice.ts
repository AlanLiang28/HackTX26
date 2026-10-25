// AI voices for encounter dialogue: the character speaks the exact line shown in the dialogue box.
// One /api/speak call per distinct line, cached for the page's lifetime; prefetchLines() starts lines
// early so each is usually ready by the time it appears.
import { api } from "./classroom";

export type SpokenLine = { audioBase64: string; mimeType: string };

const cache = new Map<string, Promise<SpokenLine>>();
const MAX_CACHED_LINES = 60; // ~0.5 MB of audio each

export function fetchSpokenLine(text: string, interest: string) {
  // The request body doubles as the cache key.
  const key = JSON.stringify({ text, interest });
  let line = cache.get(key);
  if (!line) {
    line = api<SpokenLine>("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
    }).then((data) => {
      if (typeof data.audioBase64 !== "string" || !data.audioBase64)
        throw new Error("No voice available.");
      return data;
    });
    line.catch(() => cache.delete(key)); // let the encounter retry
    cache.set(key, line);
    if (cache.size > MAX_CACHED_LINES) cache.delete(cache.keys().next().value!);
  }
  return line;
}

// Two at a time, in order, keeps the next lines coming without tripping the per-minute limit.
export function prefetchLines(lines: string[], interest: string, parallel = 2) {
  const queue = [...lines];
  const worker = async () => {
    while (queue.length)
      await fetchSpokenLine(queue.shift()!, interest).catch(() => {});
  };
  for (let i = 0; i < Math.min(parallel, queue.length); i++) void worker();
}
