import { useEffect, useRef, useState } from "react";

// One request at a time, with cancellation on navigation and no polling in a hidden tab.
export function usePolling<T>(
  load: (signal: AbortSignal) => Promise<T>,
  interval: number,
  paused = false,
) {
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        if (!document.hidden) {
          const next = await loader.current(controller.signal);
          if (!controller.signal.aborted) {
            setData(next);
            setError("");
          }
        }
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Could not refresh. Please try again.",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, interval);
    }
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [interval, paused, revision]);
  return { data, error, refresh: () => setRevision((value) => value + 1) };
}
