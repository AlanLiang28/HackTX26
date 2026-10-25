import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PixelIcon } from "./components/PixelIcon";
import { PixelSprite } from "./components/PixelSprite";
import { WorldScreen, MaterialsScreen } from "./components/SetupScreens";
import { AdventureMap } from "./components/AdventureMap";
import { Encounter } from "./components/Encounter";
import { Modal } from "./components/Modal";
import { getDemoSession, readQuestLog, saveQuest } from "./lib/study";
import { getCharacter, worlds } from "./lib/characters";
import type { QuestRecord, StudySession, Theme } from "./lib/study";
import "./App.css";
import {
  adaptiveStudySession,
  startAdaptiveGame,
  nextAdaptiveEncounter,
  gradeAdaptiveAnswer,
  restartAdaptiveGame,
} from "./lib/adaptive";
import type { AdaptiveGame, RemoteEncounter } from "./lib/adaptive";

type Screen = "world" | "materials" | "journey" | "battle" | "results";
type Overlay = "help" | "history" | "notes" | "home" | null;
const setupScreens: Screen[] = ["world", "materials"];
const navSteps = ["Your world", "Your notes", "Your adventure"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("world");
  const [theme, setTheme] = useState<Theme>("fantasy");
  const [notes, setNotes] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<StudySession | null>(null);
  const [demo, setDemo] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [encounter, setEncounter] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [adaptive, setAdaptive] = useState<AdaptiveGame | null>(null);
  const [remoteEncounter, setRemoteEncounter] =
    useState<RemoteEncounter | null>(null);
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState("");
  const [hp, setHp] = useState(20);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sound, setSound] = useState(false);
  const [log, setLog] = useState<QuestRecord[]>(readQuestLog);
  const audio = useRef<AudioContext | null>(null);
  const request = useRef<AbortController | null>(null);
  const saved = useRef(false);
  const main = useRef<HTMLElement>(null);
  const activeStep = screen === "world" ? 0 : screen === "materials" ? 1 : 2;
  const correct = adaptive
    ? adaptive.state.defeated
    : (session?.content.quiz.filter(
        (question, index) => answers[index] === question.answer,
      ).length ?? 0);
  const failed = adaptive?.state.phase === "game_over";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    main.current?.focus({ preventScroll: true });
  }, [screen, encounter]);
  useEffect(
    () => () => {
      request.current?.abort();
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
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = "square";
      tone.frequency.setValueAtTime(523.25, context.currentTime);
      tone.frequency.setValueAtTime(783.99, context.currentTime + 0.07);
      volume.gain.setValueAtTime(0.025, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + 0.18,
      );
      tone.connect(volume).connect(context.destination);
      tone.start();
      tone.stop(context.currentTime + 0.18);
    } catch {
      /* Audio is optional. */
    }
  }
  function beginSession(next: StudySession, isDemo: boolean) {
    if (isDemo) setAdaptive(null);
    setRemoteEncounter(null);
    setGameError("");
    setSession(next);
    setDemo(isDemo);
    setCompleted(0);
    setEncounter(0);
    setAnswers({});
    setHp(20);
    setError("");
    saved.current = false;
    setScreen("journey");
    chime();
  }
  function goHome() {
    setOverlay(null);
    setScreen("world");
    setError("");
  }

  async function loadFile(file: File) {
    setError("");
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError(
        "Choose a TXT or Markdown file. For PDFs or slides, paste the text instead.",
      );
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Choose a file under 1 MB, or paste a shorter excerpt.");
      return;
    }
    try {
      const content = await file.text();
      if (!content.trim())
        throw new Error(
          "That file is empty. Choose another file or paste your notes.",
        );
      if (content.length > 20000)
        throw new Error("Choose a shorter excerpt, up to 20,000 characters.");
      setNotes(content);
      setFilename(file.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that file. Please try again.",
      );
    }
  }
  async function createQuest(event: FormEvent) {
    event.preventDefault();
    if (loading || !notes.trim()) return;
    setError("");
    setLoading(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const game = await startAdaptiveGame(
        notes.trim(),
        theme,
        controller.signal,
      );
      setAdaptive(game);
      beginSession(adaptiveStudySession(game, notes.trim(), theme), false);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "This is taking longer than expected. Try again, or explore the demo."
          : err instanceof Error
            ? err.message
            : "Could not connect. Try again, or explore the demo.",
      );
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      setLoading(false);
    }
  }
  async function enterEncounter(index: number) {
    if (
      !session ||
      gameBusy ||
      index !== completed ||
      index > session.content.quiz.length
    )
      return;
    if (adaptive && adaptive.state.phase === "game_over") {
      setScreen("results");
      return;
    }
    if (adaptive && index < session.content.quiz.length) {
      setGameBusy(true);
      setGameError("");
      try {
        const next = await nextAdaptiveEncounter(adaptive);
        setAdaptive({ ...adaptive, state: next.state });
        if (!next.encounter) {
          setCompleted(next.state.completed);
          return;
        }
        const current = next.encounter;
        setRemoteEncounter(current);
        setSession((previous) =>
          previous
            ? {
                ...previous,
                content: {
                  ...previous.content,
                  quiz: previous.content.quiz.map((question, slot) =>
                    slot === index
                      ? {
                          question: current.question.prompt,
                          options: current.question.options,
                          answer: -1,
                          subtopic: current.enemy.subtopic,
                        }
                      : question,
                  ),
                },
              }
            : previous,
        );
      } catch (err) {
        setGameError(
          err instanceof Error
            ? err.message
            : "Could not load the next encounter. Try again.",
        );
        return;
      } finally {
        setGameBusy(false);
      }
    } else setRemoteEncounter(null);
    setEncounter(index);
    setScreen("battle");
    chime();
  }
  async function gradeAnswer(choice: number) {
    if (!adaptive || !remoteEncounter)
      throw new Error("Return to the trail and load the encounter again.");
    setGameBusy(true);
    try {
      const result = await gradeAdaptiveAnswer(
        adaptive,
        remoteEncounter,
        choice,
      );
      setAdaptive({ ...adaptive, state: result.state });
      setCompleted(result.state.completed);
      setHp(Math.round((result.state.lives / result.state.maxLives) * 20));
      setAnswers((previous) => ({ ...previous, [encounter]: result.choice }));
      setSession((previous) =>
        previous
          ? {
              ...previous,
              content: {
                ...previous.content,
                quiz: previous.content.quiz.map((question, slot) =>
                  slot === encounter
                    ? {
                        ...question,
                        answer: result.correctIndex,
                        explanation: result.explanation,
                      }
                    : question,
                ),
              },
            }
          : previous,
      );
      if (result.correct) chime();
      return result;
    } finally {
      setGameBusy(false);
    }
  }
  async function replay() {
    if (!session || gameBusy) return;
    if (!adaptive) {
      beginSession(session, demo);
      return;
    }
    setGameBusy(true);
    setGameError("");
    try {
      const state = await restartAdaptiveGame(adaptive);
      const game = { ...adaptive, state };
      setAdaptive(game);
      beginSession(adaptiveStudySession(game, session.topic, theme), false);
    } catch (err) {
      setGameError(
        err instanceof Error
          ? err.message
          : "Could not restart. Please try again.",
      );
    } finally {
      setGameBusy(false);
    }
  }
  function recordAnswer(answer: number) {
    setAnswers((previous) =>
      previous[encounter] === undefined
        ? { ...previous, [encounter]: answer }
        : previous,
    );
  }
  function finishQuest() {
    if (!session || saved.current) return;
    saved.current = true;
    const record: QuestRecord = {
      id: crypto.randomUUID(),
      title: session.content.title || `${worlds[theme].name} demo`,
      theme,
      score: correct,
      total: session.content.quiz.length,
      completedAt: new Date().toISOString(),
      players: 1,
      demo,
    };
    setLog(saveQuest(record));
    setCompleted(session.content.quiz.length + 1);
    setScreen("results");
    chime();
  }

  return (
    <div
      className={`app theme-${theme} ${screen === "battle" ? "in-combat" : ""}`}
    >
      <div className="world-background" aria-hidden="true" />
      <div className="world-wash" aria-hidden="true" />
      <div className="ambient-pixels" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="site-header">
        <button
          className="brand"
          aria-label="StudyRaid home"
          disabled={loading || gameBusy}
          onClick={() =>
            setupScreens.includes(screen) || screen === "results"
              ? goHome()
              : setOverlay("home")
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
        {screen !== "battle" && (
          <nav className="step-nav" aria-label="Adventure progress">
            {navSteps.map((step, index) => (
              <span
                className={`nav-step ${index === activeStep ? "active" : ""} ${index < activeStep ? "complete" : ""}`}
                key={step}
                aria-current={index === activeStep ? "step" : undefined}
              >
                <span className="step-number">
                  {index < activeStep ? (
                    <PixelIcon name="check" size={12} />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
                <span>{step}</span>
                {index < 2 && <i />}
              </span>
            ))}
          </nav>
        )}
        <div className="header-actions">
          {screen !== "battle" && (
            <button
              className="text-button how-button"
              aria-label="How to play"
              onClick={() => setOverlay("help")}
            >
              <PixelIcon name="help" size={16} />
              <span>How to play</span>
            </button>
          )}
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
          {screen !== "battle" && (
            <button
              className="icon-button"
              aria-label="Open quest log"
              onClick={() => setOverlay("history")}
            >
              <PixelIcon name="book" size={18} />
            </button>
          )}
        </div>
      </header>

      <main
        ref={main}
        tabIndex={-1}
        className={`main-content screen-${screen}`}
      >
        {screen === "world" && (
          <WorldScreen
            theme={theme}
            onChoose={(next) => {
              setTheme(next);
              chime();
            }}
            onContinue={() => {
              setScreen("materials");
              chime();
            }}
          />
        )}
        {screen === "materials" && (
          <MaterialsScreen
            theme={theme}
            notes={notes}
            filename={filename}
            loading={loading}
            error={error}
            onNotes={(value) => {
              setNotes(value);
              setFilename("");
              setError("");
            }}
            onFile={loadFile}
            onSubmit={createQuest}
            onDemo={() => beginSession(getDemoSession(theme), true)}
            onBack={() => setScreen("world")}
          />
        )}
        {screen === "journey" && session && (
          <AdventureMap
            theme={theme}
            session={session}
            completed={completed}
            demo={demo}
            onEnter={enterEncounter}
            onNotes={() => setOverlay("notes")}
            busy={gameBusy}
            error={gameError}
            outcomes={adaptive?.state.trail}
          />
        )}
        {screen === "battle" && session && (
          <Encounter
            key={`${theme}-${encounter}`}
            theme={theme}
            session={session}
            index={encounter}
            hp={hp}
            onGrade={adaptive && remoteEncounter ? gradeAnswer : undefined}
            focus={adaptive?.state.weakest?.name}
            onAnswer={recordAnswer}
            onPass={() => {
              setCompleted((value) => Math.max(value, encounter + 1));
              chime();
            }}
            onMistake={() => setHp((value) => Math.max(0, value - 4))}
            onContinue={() =>
              setScreen(
                adaptive?.state.phase === "game_over" ? "results" : "journey",
              )
            }
            onLeave={() => {
              if (hp === 0 && !adaptive) setHp(20);
              setScreen("journey");
            }}
            onRegroup={() => {
              setHp(20);
              setScreen("journey");
            }}
            onNotes={() => setOverlay("notes")}
            onFinish={finishQuest}
          />
        )}
        {screen === "results" && session && (
          <>
            <div className="page-intro">
              <div className="eyebrow">
                <PixelIcon name="spark" size={15} />A FEW NEW FRIENDS. A FEW NEW
                IDEAS.
              </div>
              <h1>
                {failed ? "Time to regroup." : "Quest complete."}
                <br />
                <span>
                  {failed ? "A little wiser already." : "Knowledge unlocked."}
                </span>
              </h1>
              <p>
                {failed
                  ? "Review the tricky concepts, then try a fresh run."
                  : "You listened. You thought it through. You explained it."}
              </p>
            </div>
            <section className="results-panel pixel-panel">
              <div className="victory-emblem">
                <PixelSprite kind="trophy" />
                <span>✦</span>
              </div>
              <span className="subject-label">
                {worlds[theme].name.toUpperCase()} ADVENTURE
                {demo ? " · DEMO" : ""}
              </span>
              {session.content.title && <h2>{session.content.title}</h2>}
              <div className="result-friends" aria-label="Characters you met">
                {Array.from(
                  {
                    length: failed
                      ? completed
                      : session.content.quiz.length + 1,
                  },
                  (_, index) => (
                    <span key={index}>
                      <PixelSprite
                        kind={
                          getCharacter(
                            theme,
                            index,
                            index === session.content.quiz.length,
                          ).sprite
                        }
                      />
                    </span>
                  ),
                )}
              </div>
              <div className="results-stats">
                <div>
                  <strong>
                    {correct}
                    <small>/{session.content.quiz.length}</small>
                  </strong>
                  <span>Correct on first try</span>
                </div>
                <div>
                  <strong>{completed}</strong>
                  <span>Characters met</span>
                </div>
                <div>
                  <strong>
                    <PixelIcon name={failed ? "book" : "check"} size={28} />
                  </strong>
                  <span>
                    {failed ? "Ready to review" : "Explanation practiced"}
                  </span>
                </div>
              </div>
              <div className="results-recap">
                <h3>
                  <PixelIcon name="book" size={17} />
                  Take this with you
                </h3>
                <p>{session.content.summary}</p>
              </div>
              {correct < session.content.quiz.length && (
                <div className="review-topics">
                  <h3>Worth another look</h3>
                  {session.content.quiz
                    .filter(
                      (question, index) =>
                        answers[index] !== undefined &&
                        answers[index] !== question.answer,
                    )
                    .map((question, index) => (
                      <p key={index}>
                        <PixelIcon name="arrow" size={13} />
                        {question.question}
                      </p>
                    ))}
                </div>
              )}
              <p className="practice-note">
                {failed
                  ? `Focus next on ${adaptive?.state.weakest?.name ?? "the concepts you missed"}.`
                  : "Boss explanation completed with self-assessment."}
              </p>
              <div className="results-actions">
                <button
                  className="secondary-button"
                  onClick={() => void replay()}
                  disabled={gameBusy}
                >
                  <PixelIcon name="retry" size={16} />
                  {gameBusy ? "Restarting…" : "Play again"}
                </button>
                <button className="primary-button" onClick={goHome}>
                  New adventure
                  <PixelIcon name="arrow" size={17} />
                </button>
              </div>
              {gameError && (
                <p className="error-feedback" role="alert">
                  {gameError}
                </p>
              )}
              <button
                className="text-button view-log"
                onClick={() => setOverlay("history")}
              >
                View your quest log
                <PixelIcon name="book" size={15} />
              </button>
            </section>
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>
          <span className="location-dot" />
          {worlds[theme].location}
        </span>
        <span>SINGLE PLAYER · V0.2</span>
      </footer>

      {overlay === "help" && (
        <Modal
          title="A little guide to your quest."
          onClose={() => setOverlay(null)}
        >
          <p className="modal-description">
            A single-player adventure. The characters are your teachers—and your
            opponents.
          </p>
          <ol className="help-steps">
            <li>
              <PixelIcon name="sword" size={23} />
              <div>
                <strong>Choose a world. Bring your notes.</strong>
                <p>
                  Pick Sports or Fantasy, then upload TXT/Markdown or paste your
                  study material on the next screen.
                </p>
              </div>
            </li>
            <li>
              <PixelIcon name="book" size={23} />
              <div>
                <strong>Listen, learn, then fight.</strong>
                <p>
                  Each character explains a concept through dialogue. Continue
                  to their question, then choose your answer. The encounter menu
                  lets you review the lesson, open notes, or leave. In a live
                  quest, you have three lives. Missed concepts shape the next
                  questions. The offline demo lets you retry each question.
                </p>
              </div>
            </li>
            <li>
              <PixelIcon name="crown" size={24} />
              <div>
                <strong>Teach the final boss.</strong>
                <p>
                  Speak or type your explanation, then check it against your
                  notes. This practice boss uses self-assessment while AI
                  grading is being connected.
                </p>
              </div>
            </li>
          </ol>
          <button
            className="primary-button full-width"
            onClick={() => setOverlay(null)}
          >
            Let’s do this
            <PixelIcon name="arrow" size={17} />
          </button>
        </Modal>
      )}
      {overlay === "notes" && session && (
        <Modal
          title={`Your ${worlds[theme].book.toLowerCase()}`}
          onClose={() => setOverlay(null)}
        >
          {session.content.title && (
            <p className="modal-description">{session.content.title}</p>
          )}
          <p className="book-overview">{session.content.overview}</p>
          <div className="book-concepts">
            {session.content.mappings.map((mapping, index) => (
              <details key={index}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {mapping.concept}
                  <PixelIcon name="plus" size={13} />
                </summary>
                <p className="book-analogy">
                  Think of it as {mapping.analogy.toLowerCase()}.
                </p>
                <p>{mapping.explanation}</p>
              </details>
            ))}
          </div>
          <details className="book-limitation">
            <summary>
              Where the analogy stops
              <PixelIcon name="plus" size={13} />
            </summary>
            <p>
              {session.content.limitation ??
                "The story illustrates the concept, but does not replace its formal definition. Explain the real relationships as well as the analogy."}
            </p>
          </details>
          <button
            className="primary-button full-width book-return"
            onClick={() => setOverlay(null)}
          >
            Back to the adventure
            <PixelIcon name="arrow" size={17} />
          </button>
        </Modal>
      )}
      {overlay === "history" && (
        <Modal title="Your quest log" onClose={() => setOverlay(null)}>
          {log.length ? (
            <>
              <p className="modal-description">
                Your completed adventures, saved on this device.
              </p>
              <div className="quest-log">
                {log.map((record) => (
                  <div className="quest-record" key={record.id}>
                    <span className="quest-record-icon">
                      <PixelIcon
                        name={record.theme === "fantasy" ? "sword" : "football"}
                        size={21}
                      />
                    </span>
                    <div>
                      <strong>
                        {record.demo
                          ? `${worlds[record.theme].name} demo`
                          : record.title}
                      </strong>
                      <small>
                        {worlds[record.theme].name} · {record.score}/
                        {record.total} first try ·{" "}
                        {new Date(record.completedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                        {record.demo ? " · Demo" : ""}
                      </small>
                    </div>
                    <PixelIcon name="check" size={16} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-log">
              <PixelIcon name="book" size={38} />
              <h3>Your story starts here.</h3>
              <p>Complete an adventure and it will appear in your quest log.</p>
            </div>
          )}
        </Modal>
      )}
      {overlay === "home" && (
        <Modal
          title="Start a new adventure?"
          onClose={() => setOverlay(null)}
        >
          <p className="modal-description">
            Your current adventure will reset. Your study notes will stay here.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setOverlay(null)}
            >
              Keep adventuring
            </button>
            <button
              className="primary-button"
              onClick={goHome}
            >
              Back to camp
              <PixelIcon name="arrow" size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
