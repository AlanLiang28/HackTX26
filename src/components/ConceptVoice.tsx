// Encounter voice: the AI coach explains, out loud, every concept this opponent presents, one after another.
// Voices come from lib/voice.ts, which usually made them before the encounter opened.
import { useEffect, useRef, useState } from "react";
import { conceptFacts, fetchConceptVoice, type CoachReply } from "../lib/voice";
import type { Mapping } from "../lib/study";

type Status = "loading" | "playing" | "paused" | "done";

export function ConceptVoice({
  title,
  interest,
  concepts,
  speaker,
  localOnly = false,
  muted = false,
}: {
  title: string;
  interest: string;
  concepts: Mapping[];
  speaker: string;
  localOnly?: boolean;
  muted?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [current, setCurrent] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);

  function stop() {
    run.current++;
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
  }

  // Resolves when this concept finishes. Pause/Play act on audio.current, so the promise just waits.
  function speak(reply: CoachReply | null, c: Mapping) {
    const mine = run.current;
    return new Promise<void>((done) => {
      if (reply?.audioBase64) {
        const a = new Audio(
          `data:${reply.mimeType};base64,${reply.audioBase64}`,
        );
        a.onended = () => done();
        a.onerror = () => done(); // unplayable audio: move on instead of hanging
        audio.current = a;
        // Autoplay can be blocked; then the player presses Play and `ended` still resolves this.
        a.play().then(
          () => {
            if (mine === run.current) setStatus("playing");
          },
          () => {
            if (mine === run.current) setStatus("paused");
          },
        );
        return;
      }
      // No Gemini audio or no backend (demo): the browser's built-in voice reads it instead.
      audio.current = null;
      if (!("speechSynthesis" in window)) return done();
      const text = (reply?.script ?? conceptFacts(c)).replace(/<[^>]+>/g, " ");
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onend = () => done();
      utterance.onerror = () => done();
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      setStatus("playing");
    });
  }

  async function playFrom(start: number) {
    stop();
    const mine = run.current;
    for (let i = start; i < concepts.length; i++) {
      const reply = localOnly
        ? null
        : await fetchConceptVoice(title, interest, concepts[i]).catch(
            () => null,
          );
      if (mine !== run.current) return;
      setCurrent(i);
      await speak(reply, concepts[i]);
      if (mine !== run.current) return;
      if (i + 1 < concepts.length) setStatus("loading");
    }
    setStatus("done");
  }

  function pause() {
    if (audio.current) audio.current.pause();
    else window.speechSynthesis?.pause();
    setStatus("paused");
  }

  function resume() {
    if (muted) return;
    if (audio.current)
      audio.current.play().then(
        () => setStatus("playing"),
        () => {},
      );
    else {
      window.speechSynthesis?.resume();
      setStatus("playing");
    }
  }

  function replay() {
    if (muted) return;
    setCurrent(0);
    setStatus("loading");
    void playFrom(0);
  }

  // Muting ignores pending voice responses and stops playback. Unmuting restarts the current concept.
  useEffect(() => {
    if (muted) {
      stop();
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- playFrom only sets state after an await
    void playFrom(current);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- current advances inside playFrom; it must not restart the sequence
  }, [muted]);

  const name = concepts[current]?.concept ?? "";
  const count =
    concepts.length > 1 ? ` (${current + 1}/${concepts.length})` : "";
  return (
    <div className="concept-voice" role="status">
      <span
        className={`concept-voice-dot ${!muted && status === "playing" ? "live" : ""}`}
        aria-hidden="true"
      />
      <span className="concept-voice-label">
        {!muted && status === "loading"
          ? `${speaker} is preparing… `
          : `${speaker}${count}: `}
        <span>{name}</span>
      </span>
      {muted && <span className="concept-voice-button">Muted</span>}
      {!muted && status === "playing" && (
        <button
          className="concept-voice-button"
          aria-label="Pause spoken lesson"
          onClick={pause}
        >
          Pause
        </button>
      )}
      {!muted && status === "paused" && (
        <button
          className="concept-voice-button"
          aria-label="Play spoken lesson"
          onClick={resume}
        >
          Play
        </button>
      )}
      {!muted && status === "done" && (
        <button
          className="concept-voice-button"
          aria-label="Replay spoken lesson"
          onClick={replay}
        >
          Replay
        </button>
      )}
    </div>
  );
}
