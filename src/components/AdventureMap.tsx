import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { getCharacter, worlds } from "../lib/characters";
import type { StudySession, Theme } from "../lib/study";

export function AdventureMap({
  theme,
  session,
  completed,
  demo,
  onEnter,
  onNotes,
}: {
  theme: Theme;
  session: StudySession;
  completed: number;
  demo: boolean;
  onEnter: (index: number) => void;
  onNotes: () => void;
}) {
  const total = session.content.quiz.length;
  const next = getCharacter(theme, completed, completed === total);
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">
          CHAPTER 03 · YOUR ADVENTURE AWAITS
          {demo && <span className="small-badge">DEMO</span>}
        </div>
        <h1>
          A few new faces.
          <br />
          <span>A whole lot to learn.</span>
        </h1>
        <p>{session.content.title}</p>
      </div>
      <section
        className="adventure-panel pixel-panel"
        aria-label="Your adventure trail"
      >
        <div className="trail-heading">
          <div>
            <span className="subject-label">{worlds[theme].location}</span>
            <h2>Your path to understanding</h2>
          </div>
          <span className="trail-counter">
            {completed}/{total + 1}
            <small>ENCOUNTERS</small>
          </span>
        </div>
        <div className="adventure-trail">
          {Array.from({ length: total + 1 }, (_, index) => {
            const boss = index === total;
            const character = getCharacter(theme, index, boss);
            const state =
              index < completed
                ? "cleared"
                : index === completed
                  ? "current"
                  : "locked";
            return (
              <div
                className={`trail-stop ${state} ${boss ? "boss-stop" : ""}`}
                key={index}
              >
                <span className="trail-number">
                  {state === "cleared" ? (
                    <PixelIcon name="check" size={15} />
                  ) : boss ? (
                    <PixelIcon name="crown" size={17} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <div className="trail-sprite">
                  <PixelSprite kind={character.sprite} />
                </div>
                <div className="trail-character">
                  <span>
                    {boss
                      ? "FINAL BOSS"
                      : `ENCOUNTER ${String(index + 1).padStart(2, "0")}`}
                  </span>
                  <h3>{character.name}</h3>
                  <p>
                    {state === "cleared"
                      ? "A lesson learned. A new friend made."
                      : character.role.toLowerCase()}
                  </p>
                </div>
                {state === "current" ? (
                  <button
                    className="trail-enter"
                    onClick={() => onEnter(index)}
                    aria-label={`Meet ${character.name}`}
                  >
                    <PixelIcon name="arrow" size={20} />
                  </button>
                ) : (
                  <span className="trail-status">
                    {state === "cleared" ? "CLEARED" : "UP NEXT"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="trail-tip">
          <PixelIcon name="heart" size={17} />
          <p>
            Every character has something to teach you. Listen, learn, then make
            your move.
          </p>
        </div>
        <button
          className="primary-button full-width"
          onClick={() => onEnter(completed)}
        >
          {completed === 0 ? `Meet ${next.name}` : `Continue to ${next.name}`}
          <PixelIcon name={completed === total ? "crown" : "arrow"} size={18} />
        </button>
      </section>
      <button className="text-button below-back" onClick={onNotes}>
        <PixelIcon name="book" size={16} />
        Open your {worlds[theme].book.toLowerCase()}
      </button>
    </>
  );
}
