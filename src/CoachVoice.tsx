import { useEffect, useRef, useState } from "react";
import { api } from "./lib/classroom";
import { PixelIcon } from "./components/PixelIcon";

type CoachReply = {
  script: string;
  audioBase64: string | null;
  mimeType: string;
  persona: string;
};
export default function CoachVoice({
  topic,
  interest,
  facts,
}: {
  topic: string;
  interest: string;
  facts?: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text.replace(/<[^>]+>/g, " "),
    );
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }
  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    window.speechSynthesis?.cancel();
    const controller = new AbortController();
    request.current = controller;
    try {
      const data = await api<CoachReply>("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, interest, facts }),
        signal: controller.signal,
      });
      if (typeof data.script !== "string")
        throw new Error("The coach response was incomplete.");
      if (!controller.signal.aborted) {
        setReply(data);
        if (!data.audioBase64) speak(data.script);
      }
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "The coach is unavailable. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <section className="voice-coach" aria-label="Voice lesson">
      <button
        className="secondary-button full-width"
        disabled={loading}
        onClick={() => void load()}
      >
        <PixelIcon name="sound" size={17} />
        {loading
          ? "Your guide is preparing the lesson…"
          : reply
            ? "Hear a fresh explanation"
            : "Hear this lesson"}
      </button>
      {loading && (
        <p className="field-help" role="status">
          Your guide is putting it in their own words.
        </p>
      )}
      {error && (
        <p className="error-feedback" role="alert">
          {error}
        </p>
      )}
      {reply && (
        <div className="voice-reply">
          {reply.audioBase64 ? (
            <audio
              controls
              autoPlay
              src={`data:${reply.mimeType};base64,${reply.audioBase64}`}
            />
          ) : window.speechSynthesis ? (
            <button className="text-button" onClick={() => speak(reply.script)}>
              Listen again
            </button>
          ) : (
            <p className="field-help">
              Audio is unavailable here. Read the explanation below.
            </p>
          )}
          <details open={!reply.audioBase64 && !window.speechSynthesis}>
            <summary>Read explanation</summary>
            <p>{reply.script.replace(/<short pause>/g, "…")}</p>
          </details>
        </div>
      )}
    </section>
  );
}
