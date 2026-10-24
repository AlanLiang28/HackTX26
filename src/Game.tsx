import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./Game.css";

// ---- Types: the shapes returned by /api/game/* ----
export type GameMaterial = { text: string; pdfs: { name: string; data: string }[] };

type ReportRow = {
  id: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
  score: number;
};
type PlayerView = {
  playerId: string;
  name: string;
  lives: number;
  maxLives: number;
  completed: number;
  total: number;
  defeated: number;
  trail: boolean[];
  phase: "battle" | "boss_ready" | "game_over";
  report: ReportRow[];
  weakest: ReportRow | null;
};
type Encounter = {
  number: number;
  enemy: { name: string; emoji: string; taunt: string; subtopic: string };
  question: { id: string; prompt: string; options: string[] };
};
type PublicPack = {
  title: string;
  accent: string;
  boss: { name: string; emoji: string; intro: string };
  subtopics: { id: string; name: string }[];
};
type StartResponse = { gameId: string; playerId: string; pack: PublicPack; state: PlayerView };
type AnswerResponse = { correct: boolean; correctIndex: number; explanation: string; state: PlayerView };
type Screen = "loading" | "battle" | "boss" | "over" | "error";

type Props = {
  topic: string;
  interest: string;
  level: string;
  material: GameMaterial;
  onExit: () => void;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
  return data as T;
}

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const screenFor = (phase: PlayerView["phase"]): Screen =>
  phase === "boss_ready" ? "boss" : phase === "game_over" ? "over" : "battle";

export default function Game({ topic, interest, level, material, onExit }: Props) {
  const [session, setSession] = useState<{ gameId: string; playerId: string; pack: PublicPack } | null>(null);
  const [state, setState] = useState<PlayerView | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function loadEncounter(gameId: string, playerId: string) {
    const data = await post<{ encounter: Encounter | null; state: PlayerView }>(`/api/game/${gameId}/next`, { playerId });
    setState(data.state);
    if (data.encounter) {
      setEncounter(data.encounter);
      setPicked(null);
      setResult(null);
      setScreen("battle");
    } else {
      setScreen(screenFor(data.state.phase));
    }
  }

  async function begin() {
    try {
      const data = await post<StartResponse>("/api/game/start", {
        topic,
        interest,
        level,
        material: material.text,
        pdfs: material.pdfs,
      });
      setSession({ gameId: data.gameId, playerId: data.playerId, pack: data.pack });
      setState(data.state);
      await loadEncounter(data.gameId, data.playerId);
    } catch (e) {
      setError(message(e));
      setScreen("error");
    }
  }

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev; only build one game
    started.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryBuild() {
    setError("");
    setScreen("loading");
    void begin();
  }

  async function choose(index: number) {
    if (!session || result || busy) return;
    setPicked(index);
    setBusy(true);
    setError("");
    try {
      const res = await post<AnswerResponse>(`/api/game/${session.gameId}/answer`, {
        playerId: session.playerId,
        choice: index,
      });
      setResult(res);
      setState(res.state);
    } catch (e) {
      setPicked(null);
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!session || !result) return;
    const phase = result.state.phase;
    if (phase !== "battle") {
      setScreen(screenFor(phase));
      return;
    }
    setBusy(true);
    try {
      await loadEncounter(session.gameId, session.playerId);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function playAgain() {
    if (!session) return;
    setScreen("loading");
    setError("");
    try {
      const data = await post<{ state: PlayerView }>(`/api/game/${session.gameId}/restart`, {
        playerId: session.playerId,
      });
      setState(data.state);
      await loadEncounter(session.gameId, session.playerId);
    } catch (e) {
      setError(message(e));
      setScreen("error");
    }
  }

  const accent = session?.pack.accent ?? "#8b7cf6";
  const rootStyle = { "--accent": accent } as CSSProperties;

  // ---------- Loading / error ----------
  if (screen === "loading") {
    return (
      <div className="g-root" style={rootStyle}>
        <div className="g-center" role="status">
          <div className="g-spinner" />
          <h2>Building your battle</h2>
          <p className="g-muted">
            Turning your material into {interest} enemies and questions. This takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  if (screen === "error" || !session || !state) {
    return (
      <div className="g-root" style={rootStyle}>
        <div className="g-center">
          <h2>The battle didn't start</h2>
          <p className="g-muted">{error || "Something went wrong."}</p>
          <div className="g-actions">
            <button className="g-btn g-btn-primary" onClick={session ? playAgain : retryBuild}>
              Try again
            </button>
            <button className="g-btn" onClick={onExit}>
              Back to notes
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { pack } = session;

  // ---------- Boss ready ----------
  if (screen === "boss") {
    return (
      <div className="g-root" style={rootStyle}>
        <TopBar state={state} onExit={onExit} />
        <div className="g-center">
          <div className="g-boss" aria-hidden="true">{pack.boss.emoji}</div>
          <h2>{pack.boss.name} blocks the way</h2>
          <p className="g-muted">{pack.boss.intro}</p>
          <p>
            You beat {state.defeated} of {state.total} enemies with {state.lives}{" "}
            {state.lives === 1 ? "life" : "lives"} left.
          </p>
        </div>
        <Report rows={state.report} weakestId={state.weakest?.id} />
        {state.weakest && (
          <p className="g-callout">
            The boss will quiz you on <strong>{state.weakest.name}</strong>, your weakest subtopic.
          </p>
        )}
        <div className="g-actions">
          <button className="g-btn g-btn-primary" disabled title="The boss battle is coming soon">
            Boss battle coming soon
          </button>
          <button className="g-btn" onClick={playAgain}>
            Play again
          </button>
          <button className="g-btn" onClick={onExit}>
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  // ---------- Game over ----------
  if (screen === "over") {
    return (
      <div className="g-root" style={rootStyle}>
        <TopBar state={state} onExit={onExit} />
        <div className="g-center">
          <div className="g-boss" aria-hidden="true">💀</div>
          <h2>You ran out of lives</h2>
          <p className="g-muted">
            You beat {state.defeated} of {state.completed} enemies. Review the subtopics below, then go again.
          </p>
        </div>
        <Report rows={state.report} weakestId={state.weakest?.id} />
        <div className="g-actions">
          <button className="g-btn g-btn-primary" onClick={playAgain}>
            Try again
          </button>
          <button className="g-btn" onClick={onExit}>
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  // ---------- Battle ----------
  if (!encounter) return null;
  const { enemy, question } = encounter;
  const arenaClass = result ? (result.correct ? "g-arena g-win" : "g-arena g-lose") : "g-arena";

  return (
    <div className="g-root" style={rootStyle}>
      <TopBar state={state} onExit={onExit} />
      <Trail state={state} bossEmoji={pack.boss.emoji} />

      <section className={arenaClass}>
        <div className="g-enemy" aria-hidden="true">{enemy.emoji}</div>
        <div>
          <h2>{enemy.name}</h2>
          <p className="g-taunt">“{enemy.taunt}”</p>
          <span className="g-chip">{enemy.subtopic}</span>
        </div>
      </section>

      <h3 className="g-question">{question.prompt}</h3>
      <div className="g-options">
        {question.options.map((opt, i) => {
          let cls = "g-opt";
          if (result) {
            if (i === result.correctIndex) cls += " g-opt-right";
            else if (i === picked) cls += " g-opt-wrong";
            else cls += " g-opt-dim";
          } else if (picked === i) {
            cls += " g-opt-pending";
          }
          return (
            <button key={i} className={cls} onClick={() => choose(i)} disabled={Boolean(result) || busy}>
              <span className="g-letter">{"ABCD"[i]}</span>
              <span className="g-opt-text">{opt}</span>
              {result && i === result.correctIndex && <span aria-label="Correct answer">✓</span>}
              {result && i === picked && i !== result.correctIndex && <span aria-label="Your answer">✕</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="g-error">{error}</p>}

      {result && (
        <div className={result.correct ? "g-feedback g-feedback-win" : "g-feedback g-feedback-lose"} role="status">
          <strong>
            {result.correct
              ? `Direct hit. ${enemy.name} is defeated.`
              : `${enemy.name} hits you. You lose a life.`}
          </strong>
          <p>{result.explanation}</p>
          <button className="g-btn g-btn-primary" onClick={advance} disabled={busy}>
            {result.state.phase === "battle" ? "Next enemy" : "See results"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Pieces ----------
function TopBar({ state, onExit }: { state: PlayerView; onExit: () => void }) {
  return (
    <header className="g-top">
      <button className="g-link" onClick={onExit}>
        Leave game
      </button>
      <div className="g-lives" role="img" aria-label={`${state.lives} of ${state.maxLives} lives left`}>
        {Array.from({ length: state.maxLives }, (_, i) => (
          <span key={i} className={i < state.lives ? "g-heart" : "g-heart g-heart-lost"}>
            {i < state.lives ? "❤️" : "🖤"}
          </span>
        ))}
      </div>
    </header>
  );
}

function Trail({ state, bossEmoji }: { state: PlayerView; bossEmoji: string }) {
  return (
    <div className="g-trail" role="img" aria-label={`Enemy ${Math.min(state.completed + 1, state.total)} of ${state.total}, then the boss`}>
      {Array.from({ length: state.total }, (_, i) => {
        const won = state.trail[i];
        let cls = "g-pip";
        let label = "";
        if (won === true) {
          cls += " g-pip-win";
          label = "✓";
        } else if (won === false) {
          cls += " g-pip-loss";
          label = "✕";
        } else if (i === state.completed) {
          cls += " g-pip-now";
        }
        return (
          <span key={i} className={cls}>
            {label}
          </span>
        );
      })}
      <span className="g-pip g-pip-boss" aria-hidden="true">
        {bossEmoji}
      </span>
    </div>
  );
}

function Report({ rows, weakestId }: { rows: ReportRow[]; weakestId?: string }) {
  return (
    <section className="g-report">
      <h3>Your skills by subtopic</h3>
      {rows.map((r) => (
        <div key={r.id} className="g-row">
          <div className="g-row-head">
            <span>{r.name}</span>
            <span className="g-muted">
              {r.attempts === 0 ? "Not tested" : `${r.correct}/${r.attempts} correct`}
              {r.id === weakestId && <strong className="g-badge">Boss target</strong>}
            </span>
          </div>
          <div className="g-bar">
            <div className="g-bar-fill" style={{ width: `${Math.round((r.accuracy ?? 0) * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}
