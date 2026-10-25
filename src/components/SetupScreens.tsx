import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { worlds } from "../lib/characters";
import type { Theme } from "../lib/study";

export function WorldScreen({
  theme,
  onChoose,
  onContinue,
  busy = false,
  error = "",
  context,
}: {
  theme: Theme;
  onChoose: (theme: Theme) => void;
  onContinue: () => void;
  busy?: boolean;
  error?: string;
  context?: string;
}) {
  return (
    <>
      <div className="page-intro">
        <h1>
          Every great quest
          <br />
          <span>starts with your world.</span>
        </h1>
        {context && <p>{context}</p>}
      </div>
      <div className="world-picker">
        {(["sports", "fantasy"] as Theme[]).map((option) => (
          <button
            className={`world-card ${theme === option ? "selected" : ""}`}
            key={option}
            aria-pressed={theme === option}
            onClick={() => onChoose(option)}
            disabled={busy}
          >
            <span className={`world-card-art art-${option}`}>
              <span className="world-card-location">
                {worlds[option].location}
              </span>
              <span className="selection-indicator">
                {theme === option && <PixelIcon name="check" size={14} />}
              </span>
              <span className="world-card-character">
                <PixelSprite kind={worlds[option].guideSprite} />
              </span>
            </span>
            <span className="world-card-copy">
              <span className="world-card-title">
                <PixelIcon
                  name={option === "sports" ? "football" : "sword"}
                  size={22}
                />
                {worlds[option].name}
              </span>
              <span>{worlds[option].description}</span>
              <span className="world-card-detail">
                {option === "fantasy"
                  ? "SLIMES · KNIGHTS · MAGES · A DRAGON"
                  : "A ROOKIE · COACHES · THE FINAL MEETING"}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="world-next">
        <button className="primary-button" onClick={onContinue} disabled={busy}>
          {busy ? "Preparing your lesson…" : `Enter ${worlds[theme].name}`}
          <PixelIcon name="arrow" size={18} />
        </button>
      </div>
      {error && (
        <p className="error-feedback" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function MaterialsScreen({
  theme,
  notes,
  filename,
  loading,
  error,
  onNotes,
  onFile,
  onSubmit,
  onDemo,
  onBack,
}: {
  theme: Theme;
  notes: string;
  filename: string;
  loading: boolean;
  error: string;
  onNotes: (notes: string) => void;
  onFile: (file: File) => Promise<void>;
  onSubmit: (event: FormEvent) => void;
  onDemo: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function readFile(file?: File) {
    if (!file) return;
    setReading(true);
    try {
      await onFile(file);
    } finally {
      setReading(false);
    }
  }
  return (
    <>
      <div className="page-intro">
        <h1>
          What are we <span>learning today?</span>
        </h1>
      </div>
      <form className="material-panel pixel-panel" onSubmit={onSubmit}>
        <div className="guide-note">
          <PixelSprite kind={worlds[theme].guideSprite} />
          <div>
            <span>{worlds[theme].guide}</span>
            <p>“Bring something tricky. We’ll work through it together.”</p>
          </div>
        </div>
        <div className="section-heading">
          <label htmlFor={tab === "paste" ? "study-notes" : "study-file"}>
            Your study material
          </label>
          <div
            className="material-tabs"
            role="group"
            aria-label="Study material input method"
          >
            <button
              type="button"
              className={tab === "upload" ? "active" : ""}
              onClick={() => setTab("upload")}
            >
              Upload
            </button>
            <button
              type="button"
              className={tab === "paste" ? "active" : ""}
              onClick={() => setTab("paste")}
            >
              Paste text
            </button>
          </div>
        </div>
        <input
          ref={input}
          id="study-file"
          className="visually-hidden"
          tabIndex={-1}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          disabled={loading}
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {tab === "upload" ? (
          <button
            type="button"
            className={`upload-zone ${dragging ? "dragging" : ""} ${notes.trim() ? "has-file" : ""}`}
            disabled={loading || reading}
            onClick={() => input.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void readFile(event.dataTransfer.files[0]);
            }}
          >
            <PixelIcon name={notes.trim() ? "file" : "upload"} size={30} />
            <strong>
              {reading
                ? "Reading your notes…"
                : filename ||
                  (notes.trim()
                    ? "Your pasted notes are ready"
                    : "Drop your notes here")}
            </strong>
            <span>
              {notes.trim()
                ? `${notes.length.toLocaleString()} characters · click to replace`
                : "or browse files · TXT or Markdown"}
            </span>
            <small>
              Up to 20,000 characters. Paste text from PDFs or slides.
            </small>
          </button>
        ) : (
          <div className="notes-wrapper">
            <textarea
              id="study-notes"
              rows={7}
              maxLength={20000}
              value={notes}
              disabled={loading}
              onChange={(event) => onNotes(event.target.value)}
              placeholder="Paste your notes, a tricky concept, or the chapter you want to conquer…"
            />
            <span className="character-count">
              {notes.length.toLocaleString()} / 20,000 characters
            </span>
          </div>
        )}
        {error && (
          <div className="error-feedback" role="alert">
            <PixelIcon name="help" size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="material-summary">
          <PixelIcon
            name={theme === "fantasy" ? "sword" : "football"}
            size={15}
          />
          <span>{worlds[theme].name} world</span>
          <span className="summary-separator">·</span>
          <PixelIcon name="person" size={15} />
          <span>Solo round</span>
        </div>
        <button
          className="primary-button full-width"
          type="submit"
          disabled={!notes.trim() || loading || reading}
        >
          {loading ? (
            <>
              <span className="pixel-spinner" />
              Building your adventure…
            </>
          ) : (
            <>
              Create my quest
              <PixelIcon name="arrow" size={18} />
            </>
          )}
        </button>
        <p className="demo-link">
          No notes handy?{" "}
          <button type="button" onClick={onDemo} disabled={loading || reading}>
            Try a demo adventure ↗
          </button>
        </p>
      </form>
      <button
        className="text-button below-back"
        disabled={loading}
        onClick={onBack}
      >
        <PixelIcon name="arrowLeft" size={15} />
        Back to my profile
      </button>
    </>
  );
}
