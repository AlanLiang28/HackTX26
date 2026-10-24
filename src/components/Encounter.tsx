import { useState } from "react";
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
  const question = session.content.quiz[index];
  const correct = !boss && picked === question.answer;
  function checkAnswer() {
    if (picked === null || !question) return;
    onAnswer(picked);
    setPhase("feedback");
    if (picked === question.answer) {
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
          {worlds[theme].location}
        </span>
        <span>
          {boss
            ? "THE FINAL MEETING"
            : `ENCOUNTER ${String(index + 1).padStart(2, "0")}`}{" "}
          / {String(session.content.quiz.length + 1).padStart(2, "0")}
        </span>
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
          <PixelSprite kind={character.sprite} monochrome />
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
            <span className="dialogue-progress">
              {line === 0
                ? "A NEW FACE"
                : `LESSON ${line} / ${lesson.length - 1}`}
            </span>
            <DialogueBox
              key={`talk-${line}`}
              speaker={character.name}
              text={lesson[line]}
              actionLabel={
                line < lesson.length - 1
                  ? "Tell me more"
                  : passed
                    ? "Return to trail"
                    : boss
                      ? "I’m ready to explain"
                      : "I’m ready to fight"
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
                  className={`combat-answer ${picked === optionIndex ? "selected" : ""}`}
                  aria-pressed={picked === optionIndex}
                  onClick={() => setPicked(optionIndex)}
                >
                  <PixelIcon name="heart" size={14} />
                  <span className="answer-key">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
            <div className="question-footer">
              <span>THINK IT THROUGH. YOU HAVE TIME.</span>
              <button
                className="combat-small-button"
                disabled={picked === null}
                onClick={checkAnswer}
              >
                Make your move
                <PixelIcon name="sword" size={16} />
              </button>
            </div>
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
                  ? "Continue the adventure"
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
        <span className="player-name">YOU</span>
        <span>LV {String(Math.min(index + 1, 9)).padStart(2, "0")}</span>
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
        <span className="player-status">
          {boss ? "EXPLAIN TO PREVAIL" : "CURIOSITY EQUIPPED"}
        </span>
      </div>
      <nav className="combat-menu" aria-label="Encounter actions">
        <button
          className={phase === "talk" ? "active" : ""}
          onClick={() => {
            if (boss && phase === "question") onNotes();
            else {
              setLine(0);
              setPhase("talk");
            }
          }}
        >
          <PixelIcon name="book" size={19} />
          LEARN
        </button>
        <button
          className={phase === "question" ? "active" : ""}
          disabled={passed || hp === 0}
          onClick={fight}
        >
          <PixelIcon name="sword" size={20} />
          FIGHT
        </button>
        <button onClick={onNotes}>
          <PixelIcon name="file" size={18} />
          NOTES
        </button>
        <button onClick={onLeave}>
          <PixelIcon name="arrowLeft" size={18} />
          LEAVE
        </button>
      </nav>
      <p className="combat-hint">
        Take your time. Click to choose, or use Tab and Enter.
      </p>
    </div>
  );
}
