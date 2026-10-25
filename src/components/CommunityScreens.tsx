import { useState } from "react";
import { PixelSprite } from "./PixelSprite";
import { PixelIcon } from "./PixelIcon";
import type { MemberContext, Profile } from "../lib/classroom";

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="error-feedback" role="alert">
      {children}
    </p>
  );
}
export function StartScreen({
  onSelect,
  onResume,
  saved,
  busy,
  error,
}: {
  onSelect: (mode: "free" | "class" | "teacher") => void;
  onResume: () => void;
  saved: MemberContext | null;
  busy: boolean;
  error: string;
}) {
  return (
    <>
      <div className="page-intro">
        <h1>
          How are we
          <br />
          <span>studying today?</span>
        </h1>
      </div>
      <div className="entry-grid">
        <button
          className="entry-card pixel-panel"
          disabled={busy}
          onClick={() => onSelect("free")}
        >
          <PixelSprite kind="mage" />
          <h2>Bring my notes</h2>
          <p>Study solo, then find your party.</p>
          <span>
            Start a quest <PixelIcon name="arrow" size={16} />
          </span>
        </button>
        <button
          className="entry-card pixel-panel"
          disabled={busy}
          onClick={() => onSelect("class")}
        >
          <PixelSprite kind="player" />
          <h2>Join a class</h2>
          <p>A class code is your way in.</p>
          <span>
            Enter class code <PixelIcon name="arrow" size={16} />
          </span>
        </button>
        <button
          className="entry-card pixel-panel"
          disabled={busy}
          onClick={() => onSelect("teacher")}
        >
          <PixelSprite kind="astronaut" />
          <h2>Teacher desk</h2>
          <p>Share a lesson. See how it lands.</p>
          <span>
            Open classroom <PixelIcon name="arrow" size={16} />
          </span>
        </button>
      </div>
      {saved && (
        <button
          className="below-back text-button"
          disabled={busy}
          onClick={onResume}
        >
          <PixelIcon name="retry" size={16} />
          {busy ? "Finding your place…" : `Continue as ${saved.name}`}
        </button>
      )}
      {error && <Notice>{error}</Notice>}
    </>
  );
}
export function ProfileScreen({
  initial,
  initialCode = "",
  joining,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  initial: Profile;
  initialCode?: string;
  joining: boolean;
  busy: boolean;
  error: string;
  onSubmit: (profile: Profile, code: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [code, setCode] = useState(initialCode);
  return (
    <>
      <div className="page-intro">
        <h1>
          {joining ? "Your class." : "A little about you."}
          <br />
          <span>
            {joining ? "Your next adventure." : "Your kind of party."}
          </span>
        </h1>
      </div>
      <form
        className="profile-panel pixel-panel form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name: name.trim() }, code);
        }}
      >
        {joining && (
          <label className="field-label">
            Class code
            <input
              className="code-input"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                )
              }
              maxLength={6}
              minLength={6}
              required
              autoComplete="off"
              disabled={busy}
              placeholder="A1B2C3"
            />
          </label>
        )}
        <label className="field-label">
          Your name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            required
            autoComplete="name"
            disabled={busy}
            placeholder="What should we call you?"
          />
        </label>
        <p className="field-help">
          Study partners are matched by interests.
        </p>
        {error && <Notice>{error}</Notice>}
        <button
          className="primary-button full-width"
          disabled={busy || !name.trim() || (joining && code.length !== 6)}
        >
          {busy
            ? "Joining your class…"
            : joining
              ? "Join class"
              : "Continue to my notes"}
          <PixelIcon name="arrow" size={16} />
        </button>
      </form>
      <button
        className="below-back text-button"
        onClick={onBack}
        disabled={busy}
      >
        <PixelIcon name="arrowLeft" size={15} />
        Back
      </button>
    </>
  );
}
