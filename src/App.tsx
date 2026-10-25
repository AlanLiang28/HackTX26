import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PixelIcon } from "./components/PixelIcon";
import { PixelSprite } from "./components/PixelSprite";
import { WorldScreen, MaterialsScreen } from "./components/SetupScreens";
import { AdventureMap } from "./components/AdventureMap";
import { Encounter } from "./components/Encounter";
import { Modal } from "./components/Modal";
import { StartScreen, ProfileScreen } from "./components/CommunityScreens";
import { TeacherDesk } from "./components/TeacherDesk";
import { MatchingScreen } from "./components/MatchingScreen";
import { FriendsPanel } from "./components/FriendsPanel";
import { PartyBoss } from "./components/PartyBoss";
import type { TeamResult } from "./components/PartyBoss";
import {
  getMember,
  joinClass,
  playMember,
  readMember,
  recall,
  remember,
  startFreeAgent,
} from "./lib/classroom";
import type { Group, MemberContext, Profile } from "./lib/classroom";
import CoachVoice from "./CoachVoice";
import {
  getDemoSession,
  isStudySession,
  readQuestLog,
  saveQuest,
} from "./lib/study";
import { getCharacter, worlds } from "./lib/characters";
import { prefetchLines } from "./lib/voice";
import { readStudyFile } from "./lib/material";
import type { QuestRecord, StudySession, Theme } from "./lib/study";
import "./App.css";
import "./community.css";
import {
  adaptiveStudySession,
  nextAdaptiveEncounter,
  gradeAdaptiveAnswer,
  restartAdaptiveGame,
  interestFor,
  parseAdaptiveGame,
} from "./lib/adaptive";
import type { AdaptiveGame, RemoteEncounter } from "./lib/adaptive";

type Screen =
  | "start"
  | "profile"
  | "join"
  | "teacher"
  | "matching"
  | "party-boss"
  | "world"
  | "materials"
  | "journey"
  | "battle"
  | "results";
type Overlay = "help" | "history" | "notes" | "home" | "friends" | null;
const setupScreens: Screen[] = [
  "start",
  "profile",
  "join",
  "teacher",
  "world",
  "materials",
];
const navSteps = ["Setup", "Solo round", "Final meeting"];
// Kahoot-style join link: /A1B2C3 opens the join screen with the code filled in.
const linkCode =
  /^\/([a-z0-9]{6})\/?$/i.exec(location.pathname)?.[1].toUpperCase() ?? "";
if (linkCode) history.replaceState(null, "", "/");

// The current run is kept in sessionStorage (per tab), so a refresh resumes it.
const runKey = "studyraid-run";
type Run = {
  screen: Screen;
  mode: "free" | "class";
  theme: Theme;
  notes: string;
  filename: string;
  session: StudySession | null;
  demo: boolean;
  completed: number;
  encounter: number;
  answers: Record<number, number>;
  adaptive: AdaptiveGame | null;
  remoteEncounter: RemoteEncounter | null;
  hp: number;
  member: MemberContext | null;
  group: Group | null;
  teamResult: TeamResult | null;
};
function readRun(): Partial<Run> {
  if (linkCode) return {};
  try {
    const run: Partial<Run> = JSON.parse(
      sessionStorage.getItem(runKey) ?? "{}",
    );
    if (run.session && !isStudySession(run.session)) return {};
    if (run.adaptive) parseAdaptiveGame(run.adaptive);
    // An answered encounter can't be replayed, so land back on the trail.
    if (
      run.screen === "battle" &&
      run.answers?.[run.encounter ?? -1] !== undefined
    )
      run.screen = "journey";
    return run;
  } catch {
    return {};
  }
}
const resumed = readRun();

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    resumed.screen ?? (linkCode ? "join" : "start"),
  );
  const [mode, setMode] = useState<"free" | "class">(
    resumed.mode ?? (linkCode ? "class" : "free"),
  );
  const [profile, setProfile] = useState<Profile>(() => {
    const value = recall<Profile>("profile", { name: "" });
    return typeof value.name === "string" ? { name: value.name } : { name: "" };
  });
  const [member, setMember] = useState(resumed.member ?? null);
  const [savedMember, setSavedMember] = useState(readMember);
  const [group, setGroup] = useState(resumed.group ?? null);
  const [teamResult, setTeamResult] = useState(resumed.teamResult ?? null);
  const [theme, setTheme] = useState<Theme>(resumed.theme ?? "fantasy");
  const [notes, setNotes] = useState(resumed.notes ?? "");
  const [filename, setFilename] = useState(resumed.filename ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(resumed.session ?? null);
  const [demo, setDemo] = useState(resumed.demo ?? false);
  const [completed, setCompleted] = useState(resumed.completed ?? 0);
  const [encounter, setEncounter] = useState(resumed.encounter ?? 0);
  const [answers, setAnswers] = useState(resumed.answers ?? {});
  const [adaptive, setAdaptive] = useState(resumed.adaptive ?? null);
  const [remoteEncounter, setRemoteEncounter] = useState(
    resumed.remoteEncounter ?? null,
  );
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState("");
  const [hp, setHp] = useState(resumed.hp ?? 20);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sound, setSound] = useState(() => recall<boolean>("sound", true) !== false);
  const [log, setLog] = useState<QuestRecord[]>(readQuestLog);
  const audio = useRef<AudioContext | null>(null);
  const request = useRef<AbortController | null>(null);
  const saved = useRef(false);
  const main = useRef<HTMLElement>(null);
  const activeStep = setupScreens.includes(screen)
    ? 0
    : screen === "journey" || screen === "battle"
      ? 1
      : 2;
  const inCombat = screen === "battle" || screen === "party-boss";
  const correct = adaptive
    ? adaptive.state.defeated
    : (session?.content.quiz.filter(
        (question, index) => answers[index] === question.answer,
      ).length ?? 0);
  const failed = adaptive?.state.phase === "game_over";
  useEffect(() => {
    if (member && session && adaptive?.state.phase === "boss_ready")
      remember("ready-quest", {
        memberId: member.memberId,
        session,
        game: adaptive,
        answers,
      });
  }, [member, session, adaptive, answers]);
  useEffect(() => {
    const run: Run = {
      screen,
      mode,
      theme,
      notes,
      filename,
      session,
      demo,
      completed,
      encounter,
      answers,
      adaptive,
      remoteEncounter,
      hp,
      member,
      group,
      teamResult,
    };
    try {
      sessionStorage.setItem(runKey, JSON.stringify(run));
    } catch {
      /* Storage full or blocked: a refresh just starts over. */
    }
  }, [
    screen,
    mode,
    theme,
    notes,
    filename,
    session,
    demo,
    completed,
    encounter,
    answers,
    adaptive,
    remoteEncounter,
    hp,
    member,
    group,
    teamResult,
  ]);

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
  function beginSession(
    next: StudySession,
    isDemo: boolean,
    targetTheme: Theme = theme,
  ) {
    if (isDemo) {
      setAdaptive(null);
      setMember(null);
    }
    setTeamResult(null);
    setTheme(targetTheme);
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
    // Voice each character's opening line now (the same every game, so usually already cached); the
    // server is already voicing the first enemy's lesson lines while the game generates.
    if (!isDemo) {
      const encounters = next.content.quiz.length;
      prefetchLines(
        Array.from(
          { length: encounters + 1 },
          (_, i) => getCharacter(targetTheme, i, i === encounters).introduction,
        ),
        interestFor(targetTheme),
      );
    }
  }
  function goHome() {
    setOverlay(null);
    setScreen("start");
    setError("");
  }
  function rememberMember(next: MemberContext) {
    setMember(next);
    setSavedMember(next);
    remember("member", next);
  }
  async function prepare(action: (signal: AbortSignal) => Promise<void>) {
    if (loading) return;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      await action(controller.signal);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "This is taking longer than expected. Please try again."
          : err instanceof Error
            ? err.message
            : "Could not connect. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
      setLoading(false);
    }
  }
  async function loadMemberGame(
    next: MemberContext,
    targetTheme: Theme,
    signal: AbortSignal,
  ) {
    const game = await playMember(next, targetTheme, signal);
    rememberMember({ ...next, theme: targetTheme });
    setAdaptive(game);
    beginSession(
      adaptiveStudySession(game, next.class?.name ?? notes, targetTheme),
      false,
      targetTheme,
    );
  }
  function submitProfile(next: Profile, code: string) {
    setProfile(next);
    remember("profile", next);
    if (mode === "free") {
      setScreen("materials");
      return;
    }
    void prepare(async (signal) => {
      const joined = await joinClass(code, next, theme, signal);
      rememberMember(joined);
      setScreen("world");
    });
  }
  function resumeMember() {
    if (!savedMember) return;
    void prepare(async (signal) => {
      const view = await getMember(savedMember, signal);
      setMode(savedMember.kind);
      setTheme(savedMember.theme);
      rememberMember(savedMember);
      if (view.member.ready) {
        if (member?.memberId !== savedMember.memberId || !session) {
          setSession(null);
          const cached = recall<{
            memberId: string;
            session: unknown;
            game: unknown;
            answers: Record<number, number>;
          } | null>("ready-quest", null);
          if (
            cached?.memberId === savedMember.memberId &&
            isStudySession(cached.session)
          ) {
            try {
              const game = parseAdaptiveGame(cached.game);
              if (game.state.phase === "boss_ready") {
                setSession(cached.session);
                setAdaptive(game);
                setAnswers(cached.answers ?? {});
                setCompleted(game.state.completed);
              }
            } catch {
              /* A stale cache must not block the party. */
            }
          }
        }
        setScreen("matching");
      } else if (
        member?.memberId === savedMember.memberId &&
        session &&
        adaptive?.state.phase === "battle"
      )
        setScreen("journey");
      else await loadMemberGame(savedMember, savedMember.theme, signal);
    });
  }

  async function loadFile(file: File) {
    setError("");
    try {
      const content = await readStudyFile(file);
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
    void prepare(async (signal) => {
      const next = await startFreeAgent(profile, notes.trim(), theme, signal);
      rememberMember(next.member);
      setAdaptive(next.game);
      beginSession(adaptiveStudySession(next.game, notes.trim(), theme), false);
    });
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
    if (member && index === session.content.quiz.length) {
      setScreen("matching");
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
      const runTheme = member?.theme ?? theme;
      beginSession(
        adaptiveStudySession(game, session.topic, runTheme),
        false,
        runTheme,
      );
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
  function finishQuest(team?: TeamResult) {
    if (!session) {
      goHome();
      return;
    }
    if (saved.current) {
      goHome();
      return;
    }
    setTeamResult(team ?? null);
    saved.current = true;
    const record: QuestRecord = {
      id:
        team && group && member
          ? `boss-${group.code}-${member.memberId}`
          : crypto.randomUUID(),
      title: session.content.title || `${worlds[theme].name} demo`,
      theme,
      score: correct,
      total: session.content.quiz.length,
      completedAt: new Date().toISOString(),
      players: team?.players ?? 1,
      demo,
    };
    setLog(saveQuest(record));
    setCompleted(session.content.quiz.length + 1);
    setScreen("results");
    chime();
  }

  return (
    <div className={`app theme-${theme} ${inCombat ? "in-combat" : ""}`}>
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
          aria-label="fairytails home"
          disabled={loading || gameBusy}
          onClick={() =>
            setupScreens.includes(screen) || screen === "results"
              ? goHome()
              : setOverlay("home")
          }
        >
          <span className="brand-mark">
            <PixelIcon name="book" size={25} />
          </span>
          <span>
            fairy<span className="brand-accent">tails</span>
            <span className="brand-period">.</span>
          </span>
        </button>
        {!inCombat && screen !== "start" && screen !== "teacher" && (
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
          {!inCombat && (
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
            aria-label={sound ? "Mute all audio" : "Unmute all audio"}
            aria-pressed={sound}
            onClick={() => {
              const enabled = !sound;
              setSound(enabled);
              remember("sound", enabled);
              if (enabled) chime(true);
              else {
                window.speechSynthesis?.cancel();
                void audio.current?.suspend();
              }
            }}
          >
            <PixelIcon name={sound ? "sound" : "mute"} size={19} />
          </button>
          {!inCombat && savedMember?.token && (
            <button
              className="icon-button"
              aria-label="Open friends"
              onClick={() => setOverlay("friends")}
            >
              <PixelIcon name="team" size={18} />
            </button>
          )}
          {!inCombat && (
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
        {screen === "start" && (
          <StartScreen
            saved={savedMember}
            busy={loading}
            error={error}
            onResume={resumeMember}
            onSelect={(choice) => {
              setError("");
              setMember(null);
              setGroup(null);
              setDemo(false);
              setSession(null);
              setAdaptive(null);
              if (choice === "teacher") setScreen("teacher");
              else {
                setMode(choice);
                setScreen(choice === "class" ? "join" : "world");
              }
            }}
          />
        )}
        {(screen === "profile" || screen === "join") && (
          <ProfileScreen
            key={screen}
            initial={profile}
            initialCode={linkCode}
            joining={screen === "join"}
            busy={loading}
            error={error}
            onSubmit={submitProfile}
            onBack={() => {
              setError("");
              setScreen(screen === "join" ? "start" : "world");
            }}
          />
        )}
        {screen === "teacher" && <TeacherDesk onBusy={setGameBusy} />}
        {screen === "matching" && member && (
          <MatchingScreen
            key={member.memberId}
            member={member}
            soloComplete={adaptive?.state.phase === "boss_ready"}
            onBoss={(next) => {
              setGroup(next);
              setTheme(next.theme);
              setScreen("party-boss");
            }}
            onStudy={() => {
              if (session && adaptive && adaptive.state.phase !== "game_over")
                setScreen("journey");
              else
                void prepare((signal) =>
                  loadMemberGame(member, member.theme, signal),
                );
            }}
          />
        )}
        {screen === "party-boss" && group && (
          <PartyBoss
            key={group.code}
            group={group}
            theme={theme}
            muted={!sound}
            onBusy={setGameBusy}
            onNotes={session ? () => setOverlay("notes") : undefined}
            onBack={() => setScreen("matching")}
            onComplete={finishQuest}
          />
        )}
        {screen === "world" && (
          <WorldScreen
            theme={theme}
            onChoose={(next) => {
              setTheme(next);
              chime();
            }}
            onContinue={() => {
              if (mode === "class" && member)
                void prepare((signal) => loadMemberGame(member, theme, signal));
              else {
                setScreen("profile");
                chime();
              }
            }}
            busy={loading}
            error={error}
            context={
              member?.kind === "class"
                ? `${member.class!.name} · ${member.class!.teacherName}`
                : undefined
            }
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
            onBack={() => setScreen("profile")}
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
            partyBoss={!!member}
          />
        )}
        {screen === "battle" && session && (
          <Encounter
            key={`${theme}-${encounter}`}
            theme={theme}
            localVoice={demo}
            muted={!sound}
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
            onFinish={() => finishQuest()}
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
                    {failed
                      ? "Ready to review"
                      : teamResult
                        ? "Boss defeated"
                        : "Explanation practiced"}
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
                {teamResult
                  ? `Every party member passed every key concept. Team understanding: ${Math.round(teamResult.teamAverage * 100)}%.`
                  : failed
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
      </footer>

      {overlay === "help" && (
        <Modal
          title="A little guide to your quest."
          onClose={() => setOverlay(null)}
        >
          <p className="modal-description">
            Learn solo. Find your party. Explain what you know together.
          </p>
          <ol className="help-steps">
            <li>
              <PixelIcon name="sword" size={23} />
              <div>
                <strong>Choose a world. Bring your notes.</strong>
                <p>
                  Bring your own notes or join with a class code. Pick Sports or
                  Fantasy: you'll team up with players who picked the same world.
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
                  After your solo round, form a party. Take turns speaking or
                  typing explanations. Everyone must pass every key concept. The
                  offline demo uses self-assessment.
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
          <CoachVoice
            muted={!sound}
            topic={
              session.content.title ||
              session.content.mappings.map((item) => item.concept).join(", ")
            }
            interest={interestFor(theme)}
            facts={session.content.mappings.map((item) => item.explanation)}
          />
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
                        {record.players > 1
                          ? ` · ${record.players} players`
                          : ""}
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
      {overlay === "friends" && savedMember && (
        <Modal title="Friends" onClose={() => setOverlay(null)}>
          <FriendsPanel member={savedMember} />
        </Modal>
      )}
      {overlay === "home" && (
        <Modal title="Back to home?" onClose={() => setOverlay(null)}>
          <p className="modal-description">
            {member
              ? "Your class and party stay saved. You can continue studying or start a new adventure."
              : "Your study notes will stay here. You can continue studying or start a new adventure."}
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setOverlay(null)}
            >
              Keep adventuring
            </button>
            <button className="primary-button" onClick={goHome}>
              Back to home
              <PixelIcon name="arrow" size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
