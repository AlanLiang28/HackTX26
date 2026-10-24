import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import { PixelIcon } from "./components/PixelIcon";
import { PixelSprite } from "./components/PixelSprite";
import {
  getDemoSession,
  isStudySession,
  readQuestLog,
  saveQuest,
} from "./lib/study";
import type { QuestRecord, StudySession, Theme } from "./lib/study";
import "./App.css";
type Screen = "setup" | "learn" | "battle" | "results";
type Overlay = "help" | "history" | "leave" | null;
type RecognitionEvent = {
  results: ArrayLike<
    ArrayLike<{
      transcript: string;
    }> & {
      isFinal: boolean;
    }
  >;
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
const stages = ["Prepare", "Learn", "Battle", "Victory"];
const themeDetails = {
  fantasy: {
    name: "Fantasy",
    subtitle: "A little magic. A lot of knowledge.",
    tag: "THE ENCHANTED REALM",
    book: "Your spellbook",
    enemies: ["Moss Slime", "Castle Knight", "Arcane Mage"],
    boss: "The Lorekeeper",
    location: "THE EVERGREEN KINGDOM",
  },
  sports: {
    name: "Sports",
    subtitle: "Big plays start with big ideas.",
    tag: "THE HOME FIELD",
    book: "Your playbook",
    enemies: ["The Teammate", "Position Coach", "Offensive Coordinator"],
    boss: "The Head Coach",
    location: "THE HOME-FIELD STADIUM",
  },
};
function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal pixel-panel"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <PixelIcon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [theme, setTheme] = useState<Theme>("fantasy");
  const [screen, setScreen] = useState<Screen>("setup");
  const [notes, setNotes] = useState("");
  const [materialTab, setMaterialTab] = useState<"upload" | "paste">("upload");
  const [filename, setFilename] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"solo" | "team">("solo");
  const [playerNames, setPlayerNames] = useState("Player 1, Player 2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<StudySession | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sound, setSound] = useState(false);
  const [log, setLog] = useState<QuestRecord[]>(readQuestLog);
  const [conceptIndex, setConceptIndex] = useState(0);
  const [encounter, setEncounter] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [speechError, setSpeechError] = useState("");
  const [bossReview, setBossReview] = useState(false);
  const [criteria, setCriteria] = useState<boolean[]>([false, false, false]);
  const [bossPlayer, setBossPlayer] = useState(0);
  const [completedPlayers, setCompletedPlayers] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const controller = useRef<AbortController | null>(null);
  const details = themeDetails[theme];
  const players =
    mode === "team"
      ? playerNames
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 4)
      : ["You"];
  const currentStage =
    stages[["setup", "learn", "battle", "results"].indexOf(screen)];
  const quiz = session?.content.quiz ?? [];
  const isBoss = encounter >= quiz.length;
  const question = quiz[encounter];
  const correct = quiz.filter((q, index) => answers[index] === q.answer).length;
  const mapping = session?.content.mappings[conceptIndex];
  const words = explanation.trim().split(/\s+/).filter(Boolean).length;
  const activePlayer =
    players[isBoss ? bossPlayer : encounter % players.length] ?? "You";
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, encounter]);
  useEffect(
    () => () => {
      recognition.current?.abort();
      controller.current?.abort();
      void audio.current?.close();
    },
    [],
  );
  function chime(enabled = sound) {
    if (!enabled) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(523.25, context.currentTime);
      oscillator.frequency.setValueAtTime(783.99, context.currentTime + 0.07);
      gain.gain.setValueAtTime(0.025, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      /* Sound is optional. */
    }
  }
  function resetAdventure() {
    recognition.current?.abort();
    setRecording(false);
    setConceptIndex(0);
    setEncounter(0);
    setAnswers({});
    setPicked(null);
    setChecked(false);
    setExplanation("");
    setBossReview(false);
    setCriteria([false, false, false]);
    setError("");
    setBossPlayer(0);
    setCompletedPlayers([]);
    setSpeechError("");
    setRecordSeconds(0);
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError(
        "Choose a TXT or Markdown file. For a PDF or slides, paste the text instead.",
      );
      return;
    }
    if (file.size > 1024 * 1024) {
      setError(
        "That file is a little big. Choose a file under 1 MB, or paste a shorter section.",
      );
      return;
    }
    setFileLoading(true);
    try {
      const content = await file.text();
      if (!content.trim())
        throw new Error(
          "This file is empty. Try another file or paste your notes.",
        );
      if (content.length > 20000)
        throw new Error(
          "Choose a shorter excerpt, up to 20,000 characters, so the lesson stays focused.",
        );
      setNotes(content);
      setFilename(file.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that file. Please try again.",
      );
    } finally {
      setFileLoading(false);
    }
  }
  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  }
  function validatePlayers() {
    if (
      mode === "team" &&
      playerNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean).length > 4
    ) {
      setError("This party has room for up to four players.");
      return false;
    }
    if (mode === "team" && players.length < 2) {
      setError("Add at least two player names, separated by commas.");
      return false;
    }
    if (
      mode === "team" &&
      new Set(players.map((name) => name.toLowerCase())).size !== players.length
    ) {
      setError("Give each teammate a different name so everyone gets a turn.");
      return false;
    }
    return true;
  }
  function startDemo() {
    if (!validatePlayers()) return;
    resetAdventure();
    setSession(getDemoSession(theme));
    setIsDemo(true);
    setScreen("learn");
    chime();
  }
  async function startAdventure(event: FormEvent) {
    event.preventDefault();
    if (!notes.trim() || loading || !validatePlayers()) return;
    resetAdventure();
    setLoading(true);
    controller.current = new AbortController();
    const timeout = window.setTimeout(() => controller.current?.abort(), 60000);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({
          topic: notes.trim(),
          interest:
            theme === "sports"
              ? "American football"
              : "fantasy adventures, knights, and dragons",
          level: "high school",
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          "Your adventure could not be created. Try again, or explore the demo below.",
        );
      if (!isStudySession(data))
        throw new Error(
          "The lesson came back incomplete. Try again to build a fresh adventure.",
        );
      setSession(data);
      setIsDemo(false);
      setScreen("learn");
      chime();
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "This is taking longer than expected. Please try again, or explore the demo."
          : err instanceof Error
            ? err.message
            : "Could not connect. Please try again, or explore the demo.",
      );
    } finally {
      window.clearTimeout(timeout);
      controller.current = null;
      setLoading(false);
    }
  }
  function checkAnswer() {
    if (picked === null || !question) return;
    setAnswers((previous) => ({ ...previous, [encounter]: picked }));
    setChecked(true);
    if (picked === question.answer) chime();
  }
  function nextEncounter() {
    setEncounter((index) => index + 1);
    setPicked(null);
    setChecked(false);
  }
  function startRecording() {
    if (recording) {
      recognition.current?.stop();
      setRecording(false);
      return;
    }
    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError(
        "Voice transcription is not available in this browser. Type your explanation below, or try Chrome.",
      );
      return;
    }
    try {
      const listener = new SpeechRecognition();
      listener.lang = "en-US";
      listener.continuous = true;
      listener.interimResults = false;
      listener.onresult = (event) => {
        const transcript = Array.from(event.results)
          .filter((result) => result.isFinal)
          .map((result) => result[0].transcript)
          .join(" ");
        setExplanation(
          [explanation.trim(), transcript].filter(Boolean).join(" "),
        );
      };
      listener.onerror = (event) => {
        setSpeechError(
          event.error === "not-allowed"
            ? "Microphone access was declined. You can still type your explanation below."
            : "The microphone could not capture your voice. Try again or type below.",
        );
        setRecording(false);
      };
      listener.onend = () => setRecording(false);
      recognition.current = listener;
      setSpeechError("");
      setRecordSeconds(0);
      listener.start();
      setRecording(true);
    } catch {
      setSpeechError(
        "Could not start the microphone. You can type your explanation below.",
      );
      setRecording(false);
    }
  }
  function finishQuest() {
    if (mode === "team" && bossPlayer < players.length - 1) {
      setCompletedPlayers((previous) => [...previous, activePlayer]);
      setBossPlayer((index) => index + 1);
      setExplanation("");
      setCriteria([false, false, false]);
      setBossReview(false);
      setRecordSeconds(0);
      return;
    }
    const record: QuestRecord = {
      id: crypto.randomUUID(),
      title: session?.content.title ?? "Study adventure",
      theme,
      score: correct,
      total: quiz.length,
      completedAt: new Date().toISOString(),
      players: players.length,
      demo: isDemo,
    };
    setLog(saveQuest(record));
    setScreen("results");
    chime();
  }
  function returnToSetup() {
    resetAdventure();
    setScreen("setup");
    setOverlay(null);
  }
  return (
    <div className={`app theme-${theme}`}>
      <div className="world-background" aria-hidden="true" />
      <div className="world-wash" aria-hidden="true" />
      <div className="ambient-pixels" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="site-header">
        <button
          className="brand"
          aria-label="StudyRaid home"
          onClick={() =>
            screen === "setup" || screen === "results"
              ? returnToSetup()
              : setOverlay("leave")
          }
        >
          <span className="brand-mark">
            <PixelIcon name="sword" size={25} />
          </span>
          <span>
            study<span className="brand-accent">raid</span>
            <span className="brand-period">.</span>
          </span>
        </button>
        <nav className="step-nav" aria-label="Adventure progress">
          {stages.map((stage, index) => (
            <span
              key={stage}
              className={`nav-step ${currentStage === stage ? "active" : ""} ${stages.indexOf(currentStage) > index ? "complete" : ""}`}
              aria-current={currentStage === stage ? "step" : undefined}
            >
              <span className="step-number">
                {stages.indexOf(currentStage) > index ? (
                  <PixelIcon name="check" size={12} />
                ) : (
                  `0${index + 1}`
                )}
              </span>
              <span>{stage}</span>
              {index < stages.length - 1 && <span className="step-connector" />}
            </span>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="text-button how-button"
            aria-label="How to play"
            onClick={() => setOverlay("help")}
          >
            <PixelIcon name="help" size={16} />
            <span>How to play</span>
          </button>
          <button
            className="icon-button"
            aria-label={sound ? "Mute game sounds" : "Enable game sounds"}
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              chime(!sound);
            }}
          >
            <PixelIcon name={sound ? "sound" : "mute"} size={19} />
          </button>
          <button
            className="icon-button quest-log-button"
            aria-label="Open quest log"
            onClick={() => setOverlay("history")}
          >
            <PixelIcon name="book" size={19} />
          </button>
        </div>
      </header>
      <main className={`main-content screen-${screen}`}>
        {screen === "setup" && (
          <>
            <div className="page-intro">
              <div className="eyebrow">
                <span className="tiny-spark">✦</span>A NEW WAY TO LEVEL UP
                <span className="tiny-spark">✦</span>
              </div>
              <h1>
                Small lessons.
                <br />
                <span>Legendary adventures.</span>
              </h1>
              <p>Your notes. Your world. Your next big breakthrough.</p>
            </div>
            <form className="setup-panel pixel-panel" onSubmit={startAdventure}>
              <section className="form-section world-section">
                <div className="section-heading">
                  <label>Choose your world</label>
                  <span className="section-aside">
                    Two worlds. Endless discoveries.
                  </span>
                </div>
                <div className="theme-grid">
                  {(["sports", "fantasy"] as Theme[]).map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={`theme-card ${theme === option ? "selected" : ""}`}
                      aria-pressed={theme === option}
                      onClick={() => {
                        setTheme(option);
                        chime();
                      }}
                    >
                      <span className={`theme-card-art art-${option}`}>
                        <span className="world-label">
                          {themeDetails[option].tag}
                        </span>
                        <span className="selection-indicator">
                          {theme === option && (
                            <PixelIcon name="check" size={12} />
                          )}
                        </span>
                      </span>
                      <span className="theme-card-caption">
                        <span className="theme-card-name">
                          <PixelIcon
                            name={option === "sports" ? "football" : "sword"}
                            size={18}
                          />
                          {themeDetails[option].name}
                        </span>
                        <span className="theme-card-subtitle">
                          {themeDetails[option].subtitle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="form-section material-section">
                <div className="section-heading">
                  <label
                    htmlFor={
                      materialTab === "paste" ? "study-notes" : "study-file"
                    }
                  >
                    Bring your study material
                  </label>
                  <div
                    className="material-tabs"
                    role="group"
                    aria-label="Study material input method"
                  >
                    <button
                      type="button"
                      className={materialTab === "upload" ? "active" : ""}
                      onClick={() => setMaterialTab("upload")}
                    >
                      Upload
                    </button>
                    <button
                      type="button"
                      className={materialTab === "paste" ? "active" : ""}
                      onClick={() => setMaterialTab("paste")}
                    >
                      Paste text
                    </button>
                  </div>
                </div>
                <input
                  id="study-file"
                  ref={fileInput}
                  className="visually-hidden"
                  tabIndex={-1}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                {materialTab === "upload" ? (
                  <button
                    type="button"
                    className={`upload-zone ${dragging ? "dragging" : ""} ${notes.trim() ? "has-file" : ""}`}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    disabled={fileLoading || loading}
                  >
                    <span className="upload-icon">
                      <PixelIcon
                        name={notes.trim() ? "file" : "upload"}
                        size={24}
                      />
                    </span>
                    <span>
                      <strong>
                        {fileLoading
                          ? "Reading your notes…"
                          : filename ||
                            (notes.trim()
                              ? "Your pasted notes are ready"
                              : "Drop your notes here, or browse files")}
                      </strong>
                      <small>
                        {notes.trim()
                          ? `${notes.length.toLocaleString()} characters · click to replace`
                          : "TXT or Markdown · up to 20,000 characters"}
                      </small>
                    </span>
                    {notes.trim() && <PixelIcon name="check" size={19} />}
                  </button>
                ) : (
                  <div className="notes-wrapper">
                    <textarea
                      id="study-notes"
                      value={notes}
                      maxLength={20000}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setFilename("");
                        setError("");
                      }}
                      placeholder="Paste your notes, a tricky concept, or the chapter you want to conquer…"
                      rows={3}
                    />
                    <span className="character-count">
                      {notes.length.toLocaleString()} / 20,000 characters
                    </span>
                  </div>
                )}
              </section>
              <section className="form-section party-section">
                <div className="section-heading">
                  <label>Pick your party</label>
                  <span className="section-aside">
                    Every adventure starts somewhere.
                  </span>
                </div>
                <div className="party-options">
                  <button
                    type="button"
                    className={`party-option ${mode === "solo" ? "selected" : ""}`}
                    aria-pressed={mode === "solo"}
                    onClick={() => setMode("solo")}
                  >
                    <PixelIcon name="person" size={19} />
                    <span>Solo adventure</span>
                    <span className="radio-indicator" />
                  </button>
                  <button
                    type="button"
                    className={`party-option ${mode === "team" ? "selected" : ""}`}
                    aria-pressed={mode === "team"}
                    onClick={() => setMode("team")}
                  >
                    <PixelIcon name="team" size={21} />
                    <span>Team up</span>
                    <span className="radio-indicator" />
                  </button>
                </div>
                {mode === "team" && (
                  <div className="team-setup">
                    <label htmlFor="player-names">
                      Your party<span>2–4 names, separated by commas</span>
                    </label>
                    <input
                      id="player-names"
                      value={playerNames}
                      maxLength={120}
                      onChange={(event) => setPlayerNames(event.target.value)}
                      placeholder="Alex, Sam"
                    />
                    <small>
                      <PixelIcon name="team" size={13} />
                      Local co-op · take turns on this device.
                    </small>
                  </div>
                )}
              </section>
              {error && (
                <div className="feedback error-feedback" role="alert">
                  <PixelIcon name="help" size={18} />
                  <span>{error}</span>
                </div>
              )}
              <button
                className="primary-button start-button"
                type="submit"
                disabled={loading || fileLoading || !notes.trim()}
              >
                {loading ? (
                  <>
                    <span className="pixel-spinner" />
                    Building your adventure…
                  </>
                ) : (
                  <>
                    <PixelIcon name="sword" size={19} />
                    Start adventure
                    <PixelIcon name="arrow" size={19} />
                  </>
                )}
              </button>
              <p className="demo-link">
                Just looking around?{" "}
                <button type="button" onClick={startDemo} disabled={loading}>
                  Try a demo adventure <span aria-hidden="true">↗</span>
                </button>
              </p>
            </form>
            <div className="journey-preview">
              <span>
                <PixelIcon name="book" size={15} />
                Learn the concept
              </span>
              <span className="journey-arrow">···</span>
              <span>
                <PixelIcon name="sword" size={15} />
                Battle your way up
              </span>
              <span className="journey-arrow">···</span>
              <span>
                <PixelIcon name="crown" size={17} />
                Teach the boss
              </span>
            </div>
          </>
        )}

        {screen === "learn" && session && (
          <>
            <div className="page-intro compact-intro">
              <div className="eyebrow">
                <PixelIcon name="book" size={15} />
                {details.book.toUpperCase()}
                {isDemo && <span className="small-badge">DEMO QUEST</span>}
              </div>
              <h1>
                Know the lore.
                <br />
                <span>Then own the battle.</span>
              </h1>
              <p>A familiar world. A whole new way to understand.</p>
            </div>
            <div className="lesson-panel pixel-panel">
              <div className="lesson-title">
                <span className="subject-label">YOUR QUEST</span>
                <h2>{session.content.title}</h2>
                <p>{session.content.overview}</p>
              </div>
              {mapping && (
                <div className="concept-card" key={conceptIndex}>
                  <div className="concept-topline">
                    <span className="subject-label">
                      CONCEPT {String(conceptIndex + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {conceptIndex + 1} / {session.content.mappings.length}
                    </span>
                  </div>
                  <h3>{mapping.concept}</h3>
                  <div className="analogy-label">
                    <PixelIcon
                      name={theme === "fantasy" ? "spark" : "football"}
                      size={19}
                    />
                    <span>
                      Think of it as <strong>{mapping.analogy}</strong>
                    </span>
                  </div>
                  <p>{mapping.explanation}</p>
                  <div className="concept-navigation">
                    <button
                      className="text-button"
                      disabled={conceptIndex === 0}
                      onClick={() => setConceptIndex((index) => index - 1)}
                    >
                      <PixelIcon name="arrowLeft" size={16} />
                      Previous
                    </button>
                    <div
                      className="concept-dots"
                      aria-label="Concept selection"
                    >
                      {session.content.mappings.map((item, index) => (
                        <button
                          key={index}
                          className={index === conceptIndex ? "active" : ""}
                          aria-label={`Concept ${index + 1}: ${item.concept}`}
                          aria-pressed={index === conceptIndex}
                          onClick={() => setConceptIndex(index)}
                        />
                      ))}
                    </div>
                    <button
                      className="text-button"
                      disabled={
                        conceptIndex === session.content.mappings.length - 1
                      }
                      onClick={() => setConceptIndex((index) => index + 1)}
                    >
                      Next
                      <PixelIcon name="arrow" size={16} />
                    </button>
                  </div>
                </div>
              )}
              <details className="lesson-detail">
                <summary>
                  The big picture
                  <PixelIcon name="plus" size={14} />
                </summary>
                <p>{session.content.summary}</p>
              </details>
              <details className="lesson-detail">
                <summary>
                  Where the analogy stops
                  <PixelIcon name="plus" size={14} />
                </summary>
                <p>
                  {session.content.limitation ??
                    "The characters and setting help illustrate the idea. They do not replace the actual definition. In your answer, explain the real concept and the relationships between its parts, even when the story leaves details out."}
                </p>
              </details>
              <div className="lesson-actions">
                <button
                  className="text-button"
                  onClick={() => setOverlay("leave")}
                >
                  <PixelIcon name="arrowLeft" size={16} />
                  Back to camp
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setScreen("battle");
                    chime();
                  }}
                >
                  Enter battle
                  <PixelIcon name="sword" size={18} />
                </button>
              </div>
            </div>
            <p className="under-panel-note">
              <PixelIcon name="heart" size={13} />
              Take your time. Understanding is your strongest weapon.
            </p>
          </>
        )}

        {screen === "battle" && session && (
          <>
            <div className="battle-topline">
              <button
                className="text-button"
                onClick={() => {
                  recognition.current?.abort();
                  setRecording(false);
                  setScreen("learn");
                }}
              >
                <PixelIcon name="arrowLeft" size={16} />
                {details.book}
              </button>
              <span className="small-badge">
                {mode === "team"
                  ? `${activePlayer.toUpperCase()}'S TURN`
                  : "SOLO ADVENTURE"}
                {isDemo ? " · DEMO" : ""}
              </span>
            </div>
            <div className="battle-progress" aria-label="Battle encounters">
              {Array.from({ length: quiz.length + 1 }, (_, index) => (
                <div
                  key={index}
                  className={`encounter-node ${encounter === index ? "current" : ""} ${encounter > index ? "defeated" : ""}`}
                >
                  <span>
                    {encounter > index ? (
                      <PixelIcon name="check" size={15} />
                    ) : (
                      <PixelIcon
                        name={index === quiz.length ? "crown" : "sword"}
                        size={16}
                      />
                    )}
                  </span>
                  <small>
                    {index === quiz.length ? "BOSS" : `0${index + 1}`}
                  </small>
                </div>
              ))}
            </div>
            <div
              className={`battle-panel pixel-panel ${isBoss ? "boss-panel" : ""}`}
            >
              <div className="enemy-area">
                <div className="enemy-title">
                  <span className="subject-label">
                    {isBoss
                      ? "THE FINAL CHALLENGE"
                      : `ENCOUNTER ${encounter + 1}`}
                  </span>
                  <h1>
                    {isBoss
                      ? details.boss
                      : details.enemies[encounter % details.enemies.length]}
                  </h1>
                </div>
                <div
                  className={`sprite-stage ${checked && picked === question?.answer ? "enemy-defeated" : ""}`}
                >
                  <PixelSprite
                    kind={
                      theme === "sports"
                        ? isBoss
                          ? "coach"
                          : "player"
                        : isBoss
                          ? "dragon"
                          : encounter === 0
                            ? "slime"
                            : "knight"
                    }
                  />
                  <span className="sprite-shadow" />
                </div>
                <div className="enemy-health" aria-label="Opponent health">
                  <span
                    style={{
                      width: isBoss
                        ? `${100 - (criteria.filter(Boolean).length / 3) * 100}%`
                        : checked && picked === question?.answer
                          ? "0%"
                          : "100%",
                    }}
                  />
                </div>
                <span className="enemy-caption">
                  {isBoss
                    ? "Your explanation is your final move."
                    : "A little practice goes a long way."}
                </span>
              </div>
              {!isBoss && question && (
                <div className="question-area">
                  <p className="question-text">{question.question}</p>
                  <div className="answer-options">
                    {question.options.map((option, index) => (
                      <button
                        key={index}
                        className={`answer-option ${picked === index ? "picked" : ""} ${checked && index === question.answer ? "correct" : ""} ${checked && picked === index && index !== question.answer ? "incorrect" : ""}`}
                        disabled={checked}
                        onClick={() => setPicked(index)}
                      >
                        <span className="answer-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                        {checked && index === question.answer && (
                          <PixelIcon name="check" size={18} />
                        )}
                      </button>
                    ))}
                  </div>
                  {checked && (
                    <div
                      className={`answer-feedback ${picked === question.answer ? "success" : "needs-practice"}`}
                      role="status"
                    >
                      <PixelIcon
                        name={picked === question.answer ? "spark" : "book"}
                        size={20}
                      />
                      <div>
                        <strong>
                          {picked === question.answer
                            ? "Nice move. You’ve got this!"
                            : "A useful lesson for the next encounter."}
                        </strong>
                        <p>
                          {question.explanation ??
                            (picked === question.answer
                              ? "You connected the idea to the right answer. Keep going."
                              : `The answer is “${question.options[question.answer]}”. Revisit your ${theme === "fantasy" ? "spellbook" : "playbook"} if you want to review the concept.`)}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="battle-actions">
                    <span>
                      {correct} / {quiz.length} correct
                    </span>
                    {checked ? (
                      <button
                        className="primary-button"
                        onClick={nextEncounter}
                      >
                        {encounter === quiz.length - 1
                          ? "Face the boss"
                          : "Next encounter"}
                        <PixelIcon
                          name={
                            encounter === quiz.length - 1 ? "crown" : "arrow"
                          }
                          size={18}
                        />
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={picked === null}
                        onClick={checkAnswer}
                      >
                        Make your move
                        <PixelIcon name="arrow" size={18} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {isBoss && (
                <div className="question-area boss-question">
                  <div className="boss-mode-note">
                    <span className="status-dot" />
                    PRACTICE BOSS · SELF-ASSESSED
                  </div>
                  <p className="question-text">
                    “Teach me the main idea in your own words. Connect two
                    concepts, then give me an example.”
                  </p>
                  <p className="boss-instruction">
                    Explain <strong>{session.content.title}</strong>. Speak or
                    type below. There’s no timer to beat.
                  </p>
                  {!bossReview ? (
                    <>
                      <div className="recording-controls">
                        <button
                          className={`record-button ${recording ? "recording" : ""}`}
                          onClick={startRecording}
                        >
                          <PixelIcon
                            name={recording ? "stop" : "mic"}
                            size={19}
                          />
                          {recording ? "Stop recording" : "Record explanation"}
                        </button>
                        <span className="recording-timer">
                          {recording
                            ? `${Math.floor(recordSeconds / 60)
                                .toString()
                                .padStart(
                                  2,
                                  "0",
                                )}:${(recordSeconds % 60).toString().padStart(2, "0")}`
                            : "Or type your answer"}
                        </span>
                      </div>
                      {speechError && (
                        <p className="speech-error" role="alert">
                          {speechError}
                        </p>
                      )}
                      <label
                        className="visually-hidden"
                        htmlFor="boss-explanation"
                      >
                        Your explanation
                      </label>
                      <textarea
                        id="boss-explanation"
                        className="boss-transcript"
                        value={explanation}
                        onChange={(event) => setExplanation(event.target.value)}
                        placeholder="Here’s how I’d explain it…"
                        rows={5}
                        disabled={recording}
                      />
                      <div className="battle-actions">
                        <span>
                          {words} words
                          {words < 20
                            ? " · aim for at least 20"
                            : " · ready to review"}
                        </span>
                        <button
                          className="primary-button"
                          disabled={words < 20 || recording}
                          onClick={() => setBossReview(true)}
                        >
                          Review explanation
                          <PixelIcon name="arrow" size={18} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="boss-review">
                      <p className="review-explanation">{explanation}</p>
                      <h3>Does your explanation cover these?</h3>
                      <p className="self-check-description">
                        Check against your{" "}
                        {theme === "fantasy" ? "spellbook" : "playbook"}. This
                        practice round uses your self-check; AI grading isn’t
                        connected yet.
                      </p>
                      {[
                        "I explained the main idea accurately.",
                        `I connected at least two concepts, such as ${session.content.mappings
                          .slice(0, 2)
                          .map((item) => item.concept.toLowerCase())
                          .join(" and ")}.`,
                        "I gave an example and explained why it fits.",
                      ].map((criterion, index) => (
                        <label className="rubric-item" key={index}>
                          <input
                            type="checkbox"
                            checked={criteria[index]}
                            onChange={(event) =>
                              setCriteria((previous) =>
                                previous.map((value, position) =>
                                  position === index
                                    ? event.target.checked
                                    : value,
                                ),
                              )
                            }
                          />
                          <span>{criterion}</span>
                        </label>
                      ))}
                      <div className="battle-actions">
                        <button
                          className="text-button"
                          onClick={() => setBossReview(false)}
                        >
                          Edit explanation
                        </button>
                        <button
                          className="primary-button"
                          disabled={!criteria.every(Boolean)}
                          onClick={finishQuest}
                        >
                          {mode === "team" && bossPlayer < players.length - 1
                            ? "Next teammate"
                            : "Complete quest"}
                          <PixelIcon name="crown" size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                  {mode === "team" && (
                    <div className="team-turns">
                      {players.map((player, index) => (
                        <span
                          className={
                            index === bossPlayer ? "current-player" : ""
                          }
                          key={index}
                        >
                          <PixelIcon
                            name={
                              completedPlayers.includes(player)
                                ? "check"
                                : "person"
                            }
                            size={13}
                          />
                          {player}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="under-panel-note">
              <PixelIcon name="spark" size={14} />
              Every attempt is a level up.
            </p>
          </>
        )}

        {screen === "results" && session && (
          <>
            <div className="page-intro compact-intro">
              <div className="eyebrow">
                <PixelIcon name="spark" size={16} />A LITTLE WISER. A LITTLE
                STRONGER.
              </div>
              <h1>
                Quest complete.
                <br />
                <span>Knowledge unlocked.</span>
              </h1>
              <p>
                {mode === "team"
                  ? "Your party showed up. Everyone had a voice."
                  : "You learned it. You practiced it. You explained it."}
              </p>
            </div>
            <div className="results-panel pixel-panel">
              <div className="victory-emblem">
                <PixelSprite kind="trophy" />
                <span className="victory-spark spark-one">✦</span>
                <span className="victory-spark spark-two">✦</span>
                <span className="victory-spark spark-three">✧</span>
              </div>
              <span className="subject-label">
                {details.name.toUpperCase()} ADVENTURE{isDemo ? " · DEMO" : ""}
              </span>
              <h2>{session.content.title}</h2>
              <div className="results-stats">
                <div>
                  <strong>
                    {correct}
                    <span>/{quiz.length}</span>
                  </strong>
                  <span>Questions mastered</span>
                </div>
                <div>
                  <strong>{session.content.mappings.length}</strong>
                  <span>Concepts explored</span>
                </div>
                <div>
                  <strong>
                    <PixelIcon name="check" size={29} />
                  </strong>
                  <span>Explanation practiced</span>
                </div>
              </div>
              <div className="results-recap">
                <h3>
                  <PixelIcon name="book" size={18} />
                  Take this with you
                </h3>
                <p>{session.content.summary}</p>
              </div>
              {correct < quiz.length && (
                <div className="review-topics">
                  <h3>A little more practice</h3>
                  {quiz
                    .filter((q, index) => answers[index] !== q.answer)
                    .map((q, index) => (
                      <p key={index}>
                        <PixelIcon name="arrow" size={13} />
                        {q.question}
                      </p>
                    ))}
                </div>
              )}
              <p className="practice-note">
                Boss explanation completed with self-assessment.
              </p>
              <div className="results-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    resetAdventure();
                    setScreen("learn");
                  }}
                >
                  <PixelIcon name="retry" size={17} />
                  Practice again
                </button>
                <button className="primary-button" onClick={returnToSetup}>
                  New adventure
                  <PixelIcon name="arrow" size={18} />
                </button>
              </div>
              <button
                className="text-button view-log"
                onClick={() => setOverlay("history")}
              >
                View your quest log
                <PixelIcon name="book" size={15} />
              </button>
            </div>
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>
          <span className="location-dot" />
          {details.location}
        </span>
        <span className="footer-tagline">
          A little curiosity goes a long way.
        </span>
        <button onClick={() => setOverlay("history")}>
          QUEST LOG
          <PixelIcon name="arrow" size={12} />
        </button>
      </footer>
      {overlay === "help" && (
        <Modal
          title="Your adventure, explained."
          onClose={() => setOverlay(null)}
        >
          <p className="modal-description">
            Bring a tricky topic. Leave with a clearer understanding.
          </p>
          <ol className="help-steps">
            <li>
              <span>
                <PixelIcon name="file" />
              </span>
              <div>
                <strong>Pack your notes</strong>
                <p>
                  Upload a TXT or Markdown file, or paste your study material.
                  Pick Sports or Fantasy.
                </p>
              </div>
            </li>
            <li>
              <span>
                <PixelIcon name="book" />
              </span>
              <div>
                <strong>Learn the lore</strong>
                <p>
                  Explore explanations that connect the real concepts to your
                  chosen world.
                </p>
              </div>
            </li>
            <li>
              <span>
                <PixelIcon name="sword" />
              </span>
              <div>
                <strong>Battle, then teach</strong>
                <p>
                  Answer questions, then explain the idea aloud or in writing to
                  complete the practice boss.
                </p>
              </div>
            </li>
          </ol>
          <p className="help-footnote">
            Team mode is local co-op on one device. The practice boss uses
            self-assessment while AI grading is being connected.
          </p>
          <button
            className="primary-button full-width"
            onClick={() => setOverlay(null)}
          >
            Let’s do this
            <PixelIcon name="arrow" size={18} />
          </button>
        </Modal>
      )}
      {overlay === "history" && (
        <Modal title="Your quest log" onClose={() => setOverlay(null)}>
          {log.length ? (
            <>
              <p className="modal-description">
                Your adventures, saved on this device.
              </p>
              <div className="quest-log">
                {log.map((record) => (
                  <div className="quest-record" key={record.id}>
                    <span className={`quest-record-icon ${record.theme}`}>
                      <PixelIcon
                        name={record.theme === "fantasy" ? "sword" : "football"}
                        size={21}
                      />
                    </span>
                    <div>
                      <strong>{record.title}</strong>
                      <small>
                        {themeDetails[record.theme].name} · {record.score}/
                        {record.total} correct ·{" "}
                        {new Date(record.completedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                        {record.demo ? " · Demo" : ""}
                      </small>
                    </div>
                    <PixelIcon name="check" size={17} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-log">
              <PixelIcon name="book" size={42} />
              <h3>Your story starts here.</h3>
              <p>Complete an adventure and it will appear in your quest log.</p>
              <button
                className="primary-button"
                onClick={() => setOverlay(null)}
              >
                Back to the adventure
                <PixelIcon name="arrow" size={17} />
              </button>
            </div>
          )}
        </Modal>
      )}
      {overlay === "leave" && (
        <Modal title="Head back to camp?" onClose={() => setOverlay(null)}>
          <p className="modal-description">
            Your current battle progress will reset. Your study notes will stay
            here.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setOverlay(null)}
            >
              Keep adventuring
            </button>
            <button className="primary-button" onClick={returnToSetup}>
              Back to camp
              <PixelIcon name="arrow" size={17} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
