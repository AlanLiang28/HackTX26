import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { DialogueBox } from "./DialogueBox";
import { BossChallenge } from "./BossChallenge";
import { getCharacter, getLessonLines, worlds } from "../lib/characters";
import type { StudySession, Theme } from "../lib/study";

export function Encounter({
  theme,
  session,
  index,
  hp,
  onAnswer,
  onPass,
  onMistake,
  onContinue,
  onLeave,
  onRegroup,
  onNotes,
  onFinish,
}: {
  theme: Theme;
  session: StudySession;
  index: number;
  hp: number;
  onAnswer: (answer: number) => void;
  onPass: () => void;
  onMistake: () => void;
  onContinue: () => void;
  onLeave: () => void;
  onRegroup: () => void;
  onNotes: () => void;
  onFinish: () => void;
}) {
  const boss = index === session.content.quiz.length;
  const character = getCharacter(theme, index, boss);
  const lesson = [
    character.introduction,
    ...getLessonLines(session, index, boss),
  ];
  const [phase, setPhase] = useState<"talk" | "question" | "feedback">("talk");
  const [line, setLine] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [bossChecks, setBossChecks] = useState(0);
  const options = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        options.current &&
        event.target instanceof Node &&
        !options.current.contains(event.target)
      )
        options.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && options.current?.open) {
        options.current.open = false;
        options.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  function closeOptions() {
    if (options.current) {
      options.current.open = false;
      options.current.querySelector("summary")?.focus({ preventScroll: true });
    }
  }
  const question = session.content.quiz[index];
  const correct = !boss && picked === question.answer;
  function checkAnswer(answer: number) {
    if (phase !== "question" || !question) return;
    setPicked(answer);
    onAnswer(answer);
    setPhase("feedback");
    if (answer === question.answer) {
      setPassed(true);
      onPass();
    } else onMistake();
  }
  function fight() {
    if (!passed && phase !== "question") {
      setPhase("question");
      setPicked(null);
    }
  }
  const feedback = correct
    ? character.correct
    : `${character.incorrect} ${question?.explanation ?? `The correct answer is “${question?.options[question.answer]}”. Use your ${worlds[theme].book.toLowerCase()} to revisit the reasoning.`}`;
  return (
    <div className="encounter-shell">
      <div className="encounter-topline">
        <span>
          <span className="status-square" />
          {boss
            ? "THE FINAL MEETING"
            : `ENCOUNTER ${String(index + 1).padStart(2, "0")}`}{" "}
          / {String(session.content.quiz.length + 1).padStart(2, "0")}
        </span>
        <details ref={options} className="encounter-options">
          <summary aria-label="Encounter options">
            <span aria-hidden="true">···</span>
          </summary>
          <div className="encounter-dropdown">
            <button
              onClick={() => {
                closeOptions();
                if (boss && phase === "question") onNotes();
                else {
                  setLine(0);
                  setPhase("talk");
                }
              }}
            >
              <PixelIcon name="retry" size={14} />
              Review lesson
            </button>
            <button
              onClick={() => {
                closeOptions();
                onNotes();
              }}
            >
              <PixelIcon name="book" size={14} />
              Open {worlds[theme].book.toLowerCase()}
            </button>
            <button
              onClick={() => {
                closeOptions();
                onLeave();
              }}
            >
              <PixelIcon name="arrowLeft" size={14} />
              Back to the trail
            </button>
          </div>
        </details>
      </div>
      <section
        className={`encounter-stage ${passed ? "enemy-passed" : ""} ${phase === "feedback" && !correct ? "player-hit" : ""}`}
        aria-label={`Encounter with ${character.name}`}
      >
        <div className="character-title">
          <span>{character.role}</span>
          <h1>{character.name}</h1>
        </div>
        <div className="combat-character">
          <PixelSprite kind={character.sprite} />
          <span className="combat-ground" />
          <span className="combat-particle particle-one">✦</span>
          <span className="combat-particle particle-two">·</span>
        </div>
        <div className="opponent-health">
          <span className="opponent-health-label">
            {passed ? "UNDERSTOOD" : boss ? "UNDERSTANDING" : "RESOLVE"}
          </span>
          <div
            className="hp-track"
            role="progressbar"
            aria-label={`${character.name} resolve`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              passed ? 0 : boss ? 100 - (bossChecks / 3) * 100 : 100
            }
          >
            <span
              style={{
                width: `${passed ? 0 : boss ? 100 - (bossChecks / 3) * 100 : 100}%`,
              }}
            />
          </div>
        </div>
      </section>
      <div className="encounter-content">
        {phase === "talk" && (
          <>
            <DialogueBox
              key={`talk-${line}`}
              speaker={character.name}
              text={lesson[line]}
              actionLabel={
                line < lesson.length - 1
                  ? "Continue"
                  : passed
                    ? "Return to trail"
                    : boss
                      ? "Explain the concept"
                      : "Answer question"
              }
              onContinue={() =>
                line < lesson.length - 1
                  ? setLine((value) => value + 1)
                  : passed
                    ? onContinue()
                    : fight()
              }
            />
          </>
        )}
        {phase === "question" && !boss && question && (
          <section
            className="combat-question-box"
            aria-label={`${character.name}'s question`}
          >
            <span className="dialogue-speaker">
              {character.name.toUpperCase()} ASKS
            </span>
            <h2>
              <span>*</span>
              {question.question}
            </h2>
            <div
              className="combat-answers"
              role="group"
              aria-label="Choose your answer"
            >
              {question.options.map((option, optionIndex) => (
                <button
                  key={optionIndex}
                  className="combat-answer"
                  onClick={() => checkAnswer(optionIndex)}
                >
                  <PixelIcon name="heart" size={14} />
                  <span>{option}</span>
                </button>
              ))}
            </div>
            <p className="answer-instruction">
              Choose an answer to make your move.
            </p>
          </section>
        )}
        {phase === "question" && boss && (
          <BossChallenge
            session={session}
            onComplete={onFinish}
            onProgress={setBossChecks}
          />
        )}
        {phase === "feedback" && (
          <>
            <div
              className={`combat-result ${correct ? "success" : ""}`}
              role="status"
            >
              {correct
                ? "A GOOD CONNECTION. THE WAY OPENS."
                : hp === 0
                  ? "TAKE A BREATH. YOU CAN TRY AGAIN."
                  : "A MISSED MOVE. A CHANCE TO LEARN."}
            </div>
            <DialogueBox
              key={`feedback-${picked}`}
              speaker={character.name}
              text={feedback}
              actionLabel={
                correct
                  ? "Continue"
                  : hp === 0
                    ? "Regroup at the trail"
                    : "Try again"
              }
              onContinue={() => {
                if (correct) onContinue();
                else if (hp === 0) onRegroup();
                else {
                  setPicked(null);
                  setPhase("question");
                }
              }}
            />
          </>
        )}
      </div>
      <div className="player-stats">
        <span className="player-hp-label">HP</span>
        <div
          className="player-hp"
          role="progressbar"
          aria-label="Your health"
          aria-valuemin={0}
          aria-valuemax={20}
          aria-valuenow={hp}
        >
          <span style={{ width: `${(hp / 20) * 100}%` }} />
        </div>
        <span>{String(hp).padStart(2, "0")} / 20</span>
      </div>
    </div>
  );
}
