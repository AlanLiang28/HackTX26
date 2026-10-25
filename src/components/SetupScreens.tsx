import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { ContentProgress } from "./ContentProgress";
import { worlds } from "../lib/characters";
import type { Theme } from "../lib/study";

const upcomingWorlds = [
  {
    id: "space",
    name: "Space",
    location: "THE STARLIGHT STATION",
    icon: "rocket",
    sprite: "astronaut",
  },
  {
    id: "cooking",
    name: "Cooking",
    location: "THE COZY KITCHEN",
    icon: "utensils",
    sprite: "chef",
  },
] as const;
export type WorldPreview = (typeof upcomingWorlds)[number]["id"] | null;

export function WorldScreen({
  theme,
  preview,
  onChoose,
  onPreview,
  onContinue,
  busy = false,
  error = "",
  context,
}: {
  theme: Theme;
  preview: WorldPreview;
  onChoose: (theme: Theme) => void;
  onPreview: (preview: WorldPreview) => void;
  onContinue: () => void;
  busy?: boolean;
  error?: string;
  context?: string;
}) {
  const selectedName =
    upcomingWorlds.find((world) => world.id === preview)?.name ?? worlds[theme].name;

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
            className={`world-card ${!preview && theme === option ? "selected" : ""}`}
            key={option}
            aria-pressed={!preview && theme === option}
            onClick={() => onChoose(option)}
            disabled={busy}
          >
            <span className={`world-card-art art-${option}`}>
              <span className="world-card-location">
                {worlds[option].location}
              </span>
              <span className="selection-indicator">
                {!preview && theme === option && (
                  <PixelIcon name="check" size={14} />
                )}
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
            </span>
          </button>
        ))}
        {upcomingWorlds.map((world) => (
          <button
            className={`world-card ${preview === world.id ? "selected" : ""}`}
            key={world.id}
            aria-pressed={preview === world.id}
            onClick={() => onPreview(world.id)}
            disabled={busy}
          >
            <span className={`world-card-art art-${world.id}`}>
              <span className="world-card-badge">Coming soon</span>
              <span className="world-card-location">{world.location}</span>
              <span className="selection-indicator">
                {preview === world.id && <PixelIcon name="check" size={14} />}
              </span>
              <span className="world-card-character">
                <PixelSprite kind={world.sprite} />
              </span>
            </span>
            <span className="world-card-copy">
              <span className="world-card-title">
                <PixelIcon name={world.icon} size={22} />
                {world.name}
              </span>
            </span>
          </button>
        ))}
      </div>
      {busy && (
        <ContentProgress
          sprite={worlds[theme].guideSprite}
          label="Preparing your lesson…"
        />
      )}
      <div className="world-next">
        <button
          className="primary-button"
          onClick={onContinue}
          disabled={busy || preview !== null}
        >
          {busy ? "Preparing your lesson…" : `Enter ${selectedName}`}
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

// What the loading bar says while the game is built, in order.
const BUILD_STAGES = [
  "Reading your notes…",
  "Picking the key concepts…",
  "Designing your opponents…",
  "Writing your questions…",
  "Almost ready…",
];

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
    if (!file || loading || reading) return;
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
      <form
        className="material-panel pixel-panel"
        onSubmit={onSubmit}
        aria-busy={loading || reading}
      >
        <div className="guide-note">
          <PixelSprite kind={worlds[theme].guideSprite} />
          <div>
            <span>{worlds[theme].name} world</span>
            <p>{worlds[theme].title}</p>
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
              disabled={loading || reading}
              onClick={() => setTab("upload")}
            >
              Upload
            </button>
            <button
              type="button"
              className={tab === "paste" ? "active" : ""}
              disabled={loading || reading}
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
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          disabled={loading || reading}
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {reading || loading ? (
          <ContentProgress
            // A fresh bar (from 0%) when reading a file turns into building the game.
            key={reading ? "reading" : "building"}
            sprite={worlds[theme].guideSprite}
            label={reading ? "Reading your notes…" : "Building your adventure…"}
            // Building a game takes Muse about 25-35 s (measured); the bar is an estimate, not real progress.
            {...(!reading && { expectedMs: 30_000, stages: BUILD_STAGES })}
          />
        ) : tab === "upload" ? (
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
        disabled={loading || reading}
        onClick={onBack}
      >
        <PixelIcon name="arrowLeft" size={15} />
        Back to my profile
      </button>
    </>
  );
}
