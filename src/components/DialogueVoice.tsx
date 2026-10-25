// Encounter voice: the character reads the dialogue box aloud, line by line, as the player moves through it.
// Audio comes from lib/voice.ts; without it (demo, no backend, no quota) the browser's built-in voice reads the line.
import { useEffect, useRef, useState } from "react";
import { fetchSpokenLine, prefetchLines } from "../lib/voice";

type Status = "loading" | "playing" | "paused" | "done";

export function DialogueVoice({
  lines,
  line,
  interest,
  speaker,
  localOnly = false,
  muted = false,
}: {
  lines: string[];
  line: number;
  interest: string;
  speaker: string;
  localOnly?: boolean;
  // The global sound toggle: muting stops the voice and ignores late audio; unmuting replays the line.
  muted?: boolean;
}) {
  // Status belongs to one line; a new line starts out loading until its audio plays.
  const [state, setState] = useState<{ line: number; status: Status }>({
    line: -1,
    status: "loading",
  });
  const status = state.line === line ? state.status : "loading";
  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);

  function stop() {
    run.current++;
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
  }

  async function play(at: number) {
    stop();
    const mine = run.current;
    const set = (s: Status) => {
      if (mine === run.current) setState({ line: at, status: s });
    };
    const text = lines[at];
    const reply = localOnly
      ? null
      : await fetchSpokenLine(text, interest).catch(() => null);
    if (mine !== run.current) return;
    if (reply) {
      const a = new Audio(`data:${reply.mimeType};base64,${reply.audioBase64}`);
      a.onended = () => set("done");
      a.onerror = () => set("done"); // unplayable audio: don't hang
      audio.current = a;
      // Autoplay can be blocked; then the player presses Play.
      a.play().then(
        () => set("playing"),
        () => set("paused"),
      );
      return;
    }
    if (!("speechSynthesis" in window)) return set("done");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.onend = () => set("done");
    utterance.onerror = () => set("done");
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume(); // a paused synthesizer would otherwise stay silent
    window.speechSynthesis.speak(utterance);
    set("playing");
  }

  function pause() {
    if (muted) return;
    if (audio.current) audio.current.pause();
    else window.speechSynthesis?.pause();
    setState({ line, status: "paused" });
  }

  function resume() {
    if (muted) return;
    if (audio.current)
      audio.current.play().then(
        () => setState({ line, status: "playing" }),
        () => {},
      );
    else {
      window.speechSynthesis?.resume();
      setState({ line, status: "playing" });
    }
  }

  // The encounter remounts this per visit, so its lines are fixed: start them all now (not while muted).
  useEffect(() => {
    if (!localOnly && !muted) prefetchLines(lines, interest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speak each line as it appears; leaving the line (or the encounter), or muting, stops it.
  useEffect(() => {
    if (muted) return stop();
    void play(line);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, muted]);

  return (
    <div className="concept-voice" role="status">
      <span
        className={`concept-voice-dot ${!muted && status === "playing" ? "live" : ""}`}
        aria-hidden="true"
      />
      <span className="concept-voice-label">
        {muted
          ? speaker
          : status === "loading"
            ? `${speaker} is getting ready…`
            : status === "playing"
              ? `${speaker} is speaking`
              : speaker}
      </span>
      {muted && <span className="concept-voice-button">Muted</span>}
      {!muted && status === "playing" && (
        <button
          className="concept-voice-button"
          aria-label="Pause spoken line"
          onClick={pause}
        >
          Pause
        </button>
      )}
      {!muted && status === "paused" && (
        <button
          className="concept-voice-button"
          aria-label="Play spoken line"
          onClick={resume}
        >
          Play
        </button>
      )}
      {!muted && status === "done" && (
        <button
          className="concept-voice-button"
          aria-label="Replay spoken line"
          onClick={() => void play(line)}
        >
          Replay
        </button>
      )}
    </div>
  );
}
