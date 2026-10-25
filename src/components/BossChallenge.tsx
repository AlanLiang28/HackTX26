import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "./PixelIcon";
import type { StudySession } from "../lib/study";

type RecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function BossChallenge({
  session,
  onComplete,
  focus,
}: {
  session: StudySession;
  onComplete: () => void;
  focus?: string;
}) {
  const mappings = [...session.content.mappings].sort(
    (a, b) => Number(b.concept === focus) - Number(a.concept === focus),
  );
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const recognition = useRef<Recognition | null>(null);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  useEffect(
    () => () => {
      if (recognition.current) {
        recognition.current.onend = null;
        recognition.current.onerror = null;
        recognition.current.onresult = null;
        recognition.current.abort();
      }
    },
    [],
  );
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);
  function record() {
    if (recording) {
      recognition.current?.stop();
      setRecording(false);
      return;
    }
    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(
        "Voice transcription is unavailable here. You can type your explanation below.",
      );
      return;
    }
    try {
      const listener = new SpeechRecognition();
      listener.lang = "en-US";
      listener.continuous = true;
      listener.interimResults = false;
      const prefix = text.trim();
      listener.onresult = (event) =>
        setText(
          [
            prefix,
            Array.from(event.results)
              .filter((result) => result.isFinal)
              .map((result) => result[0].transcript)
              .join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        );
      listener.onerror = (event) => {
        setRecording(false);
        setError(
          event.error === "not-allowed"
            ? "Microphone access was declined. You can still type your explanation."
            : "Your voice could not be captured. Try again or type below.",
        );
      };
      listener.onend = () => setRecording(false);
      recognition.current = listener;
      setError("");
      setSeconds(0);
      listener.start();
      setRecording(true);
    } catch {
      setError(
        "Could not start the microphone. You can type your explanation instead.",
      );
      setRecording(false);
    }
  }
  return (
    <section className="boss-challenge" aria-label="Boss explanation challenge">
      <div className="boss-practice-label">PRACTICE BOSS · SELF-ASSESSED</div>
      <p className="boss-prompt">
        <span>*</span>{" "}
        {focus
          ? `Explain ${focus}. Connect it to another concept and give me an example.`
          : "Explain the main idea. Connect two concepts. Give me an example."}
      </p>
      {!review ? (
        <>
          <div className="recording-controls">
            <button
              className={`combat-small-button ${recording ? "recording" : ""}`}
              onClick={record}
            >
              <PixelIcon name={recording ? "stop" : "mic"} size={17} />
              {recording ? "Stop recording" : "Record explanation"}
            </button>
            <span>
              {recording
                ? `${Math.floor(seconds / 60)
                    .toString()
                    .padStart(
                      2,
                      "0",
                    )}:${(seconds % 60).toString().padStart(2, "0")}`
                : "or type below"}
            </span>
          </div>
          {error && (
            <p className="speech-error" role="alert">
              {error}
            </p>
          )}
          <label className="visually-hidden" htmlFor="boss-answer">
            Your explanation
          </label>
          <textarea
            id="boss-answer"
            value={text}
            disabled={recording}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Here’s how I’d explain it…"
          />
          <div className="boss-bottom">
            <span>
              {words} WORDS ·{" "}
              {words < 20 ? "AIM FOR AT LEAST 20" : "READY TO REVIEW"}
            </span>
            <button
              className="combat-small-button"
              disabled={words < 20 || recording}
              onClick={() => setReview(true)}
            >
              Review explanation
              <PixelIcon name="arrow" size={15} />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="boss-answer-review">{text}</p>
          <p className="boss-self-check">
            Check your explanation against your notes. This practice boss uses
            your self-assessment; AI grading is not connected yet.
          </p>
          {[
            focus
              ? `I explained ${focus} accurately.`
              : "I explained the main idea accurately.",
            `I connected concepts such as “${mappings[0].concept}” and “${mappings[Math.min(1, mappings.length - 1)].concept}”.`,
            "I gave an example and explained why it fits.",
          ].map((criterion, index) => (
            <label className="boss-check" key={index}>
              <input
                type="checkbox"
                checked={checks[index]}
                onChange={(event) => {
                  const updated = checks.map((value, position) =>
                    position === index ? event.target.checked : value,
                  );
                  setChecks(updated);
                }}
              />
              <span>{criterion}</span>
            </label>
          ))}
          <div className="boss-bottom">
            <button
              className="combat-text-button"
              onClick={() => {
                setReview(false);
                setChecks([false, false, false]);
              }}
            >
              Edit explanation
            </button>
            <button
              className="combat-small-button"
              disabled={!checks.every(Boolean)}
              onClick={onComplete}
            >
              Finish the encounter
              <PixelIcon name="crown" size={17} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
