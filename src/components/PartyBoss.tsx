import { useEffect, useRef, useState } from "react";
import type { Group } from "../lib/classroom";
import { getBoss, startBoss, submitBoss } from "../lib/party";
import type { BossGrade, BossState } from "../lib/party";
import type { Theme } from "../lib/study";
import { toWav16k } from "../lib/wav";
import { usePolling } from "../lib/usePolling";
import { getCharacter } from "../lib/characters";
import { PixelSprite } from "./PixelSprite";
import { PixelIcon } from "./PixelIcon";
import { Notice } from "./CommunityScreens";

export type TeamResult = { players: number; teamAverage: number };
export function PartyBoss({
  group,
  theme,
  muted = false,
  onComplete,
  onNotes,
  onBack,
  onBusy,
}: {
  group: Group;
  theme: Theme;
  muted?: boolean;
  onComplete: (result: TeamResult) => void;
  onNotes?: () => void;
  onBack: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const character = getCharacter(theme, 0, true);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [grade, setGrade] = useState<BossGrade | null>(null);
  const [latest, setLatest] = useState<BossState | null>(null);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const menu = useRef<HTMLDetailsElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const poll = usePolling(
    (signal) => getBoss(group.code, signal),
    1500,
    busy || recording,
  );
  const state = latest ?? poll.data;
  const turn = state?.turn;
  const mine = turn?.playerId === group.playerId;
  useEffect(() => {
    if (poll.data) setLatest(null);
  }, [poll.data]);
  useEffect(() => {
    onBusy(busy || recording);
    return () => onBusy(false);
  }, [busy, recording, onBusy]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        menu.current &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= 90 && recorder.current?.state === "recording")
      recorder.current.stop();
  }, [recording, seconds]);
  async function record() {
    if (recording) {
      if (recorder.current?.state === "recording") recorder.current.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Recording is unavailable here. You can type your explanation below.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setAudio(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const capture = new MediaRecorder(media);
      const chunks: Blob[] = [];
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onerror = () => {
        media.getTracks().forEach((track) => track.stop());
        if (alive.current) {
          setRecording(false);
          setBusy(false);
          setError(
            "Recording stopped unexpectedly. Try again or type your explanation.",
          );
        }
      };
      capture.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (!alive.current) return;
        setRecording(false);
        setBusy(true);
        try {
          const wav = await toWav16k(
            new Blob(chunks, { type: capture.mimeType }),
          );
          if (alive.current) setAudio(wav);
        } catch {
          if (alive.current)
            setError(
              "Could not prepare that recording. Try again or type your answer.",
            );
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      recorder.current = capture;
      setSeconds(0);
      capture.start();
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current)
        setError(
          "Microphone unavailable. Allow access or type your explanation instead.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (busy || recording || !mine || (!audio && !text.trim())) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await submitBoss(
        group.code,
        group.playerId,
        audio ?? text.trim(),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setGrade(result);
        setLatest(result.state);
        setAudio(null);
        setText(result.passed ? "" : result.transcript);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not grade your explanation. Try again.",
        );
        poll.refresh();
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function begin() {
    setBusy(true);
    setError("");
    const controller = new AbortController();
    pending.current = controller;
    try {
      const next = await startBoss(group.code, controller.signal);
      if (!controller.signal.aborted) setLatest(next);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Could not start.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const passed = state?.progress.filter((pair) => pair.passed).length ?? 0;
  return (
    <div className="encounter-shell party-boss-shell">
      <div className="encounter-topline">
        <span>
          <span className="status-square" />
          FINAL MEETING · {state?.players.length ?? group.members.length}{" "}
          PLAYERS
        </span>
        <details ref={menu} className="encounter-options">
          <summary aria-label="Boss options">
            <span aria-hidden="true">···</span>
          </summary>
          <div className="encounter-dropdown">
            {onNotes && (
              <button
                aria-label="Open notes"
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  onNotes();
                }}
                disabled={busy || recording}
              >
                <PixelIcon name="book" size={14} />
                Open notes
              </button>
            )}
            <button
              aria-label="Back to party"
              onClick={onBack}
              disabled={busy || recording}
            >
              <PixelIcon name="arrowLeft" size={14} />
              Back to party
            </button>
          </div>
        </details>
      </div>
      <section
        className={`encounter-stage ${state?.status === "defeated" ? "enemy-passed" : ""}`}
        aria-label={`Final meeting with ${character.name}`}
      >
        <div className="character-title">
          <span>{character.role}</span>
          <h1>{character.name}</h1>
        </div>
        <div className="combat-character">
          <PixelSprite kind={character.sprite} />
          <span className="combat-ground" />
        </div>
      </section>
      <section className="boss-challenge" aria-label="Party boss challenge">
        {!state && <p role="status">Opening the final meeting…</p>}
        {state?.status === "not_started" && (
          <>
            <p className="boss-prompt">
              Your party is ready. Everyone will explain each key concept.
            </p>
            <button
              className="combat-small-button"
              onClick={() => void begin()}
              disabled={busy}
            >
              Begin final meeting
            </button>
          </>
        )}
        {state?.status === "defeated" && (
          <div className="party-victory">
            <PixelIcon name="crown" size={32} />
            <h2>Understanding unlocked.</h2>
            <p>
              Every player passed every key concept. Your team understanding is{" "}
              {Math.round(state.teamAverage * 100)}%.
            </p>
            <button
              className="combat-small-button"
              onClick={() =>
                onComplete({
                  players: state.players.length,
                  teamAverage: state.teamAverage,
                })
              }
            >
              Finish adventure
              <PixelIcon name="arrow" size={16} />
            </button>
          </div>
        )}
        {state?.status === "active" && turn && (
          <>
            <div className="boss-practice-label">
              {mine ? "YOUR TURN" : `${turn.playerName.toUpperCase()}’S TURN`} ·
              ATTEMPT {turn.attempt}
            </div>
            {turn.reason === "rally" && (
              <p className="party-rally">
                One more connection: the party needs{" "}
                {Math.round(state.teamThreshold * 100)}% team understanding.
              </p>
            )}
            <p className="boss-prompt">
              <span>*</span>Explain {turn.concept.name} in your own words. Show
              how it works with an example.
            </p>
            <p className="boss-analogy">
              Think of it as {turn.concept.analogy}.
            </p>
            {mine ? (
              <>
                <div className="recording-controls">
                  <button
                    className={`combat-small-button ${recording ? "recording" : ""}`}
                    onClick={() => void record()}
                    disabled={busy}
                  >
                    <PixelIcon name={recording ? "stop" : "mic"} size={16} />
                    {recording
                      ? "Stop recording"
                      : audio
                        ? "Record again"
                        : "Record explanation"}
                  </button>
                  <span>
                    {recording
                      ? `${seconds}s / 90s`
                      : audio
                        ? "Recording ready"
                        : "or type below"}
                  </span>
                </div>
                {audioUrl && (
                  <div className="recording-preview">
                    <audio
                      controls
                      src={audioUrl}
                      muted={muted}
                      onVolumeChange={(event) => {
                        if (muted) event.currentTarget.muted = true;
                      }}
                    />
                    <button
                      className="combat-text-button"
                      onClick={() => setAudio(null)}
                      disabled={busy}
                    >
                      Use text instead
                    </button>
                  </div>
                )}
                {!audio && (
                  <label className="party-answer-label">
                    <span className="visually-hidden">Your explanation</span>
                    <textarea
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      maxLength={12000}
                      rows={4}
                      disabled={busy || recording}
                      placeholder="Here’s how I’d explain it…"
                    />
                  </label>
                )}
                <div className="boss-bottom">
                  <span>
                    {busy
                      ? "Preparing or grading your explanation…"
                      : "Graded on correctness, depth, understanding, and clarity."}
                  </span>
                  <button
                    className="combat-small-button"
                    disabled={busy || recording || (!audio && !text.trim())}
                    onClick={() => void submit()}
                  >
                    {busy ? "Please wait…" : "Submit explanation"}
                    <PixelIcon name="arrow" size={15} />
                  </button>
                </div>
              </>
            ) : (
              <p className="party-wait" role="status">
                Listen to {turn.playerName}’s explanation. Your turn will appear
                here automatically.
              </p>
            )}
          </>
        )}
        {state?.lastAttempt && (
          <div className="party-feedback" role="status">
            <span className="dialogue-speaker">
              {state.lastAttempt.playerName} ·{" "}
              {state.lastAttempt.passed
                ? "CONCEPT UNDERSTOOD"
                : "TRY ANOTHER ANGLE"}{" "}
              · {state.lastAttempt.total}/16
            </span>
            <p>{state.lastAttempt.feedback}</p>
            {state.lastAttempt.missedPoints.length > 0 && (
              <ul>
                {state.lastAttempt.missedPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            )}
            {grade?.hint &&
              grade.transcript === state.lastAttempt.transcript && (
                <p className="party-hint">A hint: {grade.hint}</p>
              )}
          </div>
        )}
        {(error || poll.error) && <Notice>{error || poll.error}</Notice>}
      </section>
      {state && (
        <details className="party-progress">
          <summary>
            {passed}/{state.progress.length} concepts understood · Party
            progress
          </summary>
          <div>
            {state.players.map((player) => {
              const progress = state.progress.filter(
                (pair) => pair.playerId === player.id,
              );
              return (
                <p key={player.id}>
                  <span>
                    {player.name}
                    {player.id === group.playerId ? " (you)" : ""}
                  </span>
                  <strong>
                    {progress.filter((pair) => pair.passed).length}/
                    {progress.length}
                  </strong>
                </p>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
