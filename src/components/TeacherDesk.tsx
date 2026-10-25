import { useEffect, useRef, useState } from "react";
import type { SavedClass } from "../lib/classroom";
import {
  createClass,
  getDashboard,
  readClasses,
  remember,
} from "../lib/classroom";
import { usePolling } from "../lib/usePolling";
import { readStudyFile } from "../lib/material";
import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { ContentProgress } from "./ContentProgress";
import { Notice } from "./CommunityScreens";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="secondary-button"
      onClick={() => {
        if (!navigator.clipboard) {
          setFailed(true);
          return;
        }
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setFailed(false);
          })
          .catch(() => setFailed(true));
      }}
    >
      {copied ? "Copied" : failed ? "Select text to copy" : label}
      <PixelIcon name={copied ? "check" : "file"} size={14} />
    </button>
  );
}
function TeacherDashboard({
  saved,
  freshKey,
  stored,
  onDismissKey,
  onBack,
}: {
  saved: SavedClass;
  freshKey: boolean;
  stored: boolean;
  onDismissKey: () => void;
  onBack: () => void;
}) {
  const poll = usePolling((signal) => getDashboard(saved, signal), 8000);
  const [tab, setTab] = useState<"students" | "groups" | "topics">("students");
  const data = poll.data;
  return (
    <>
      <div className="page-intro">
        <h1>
          {data?.name ?? saved.name}
          <br />
          <span>Your classroom at a glance.</span>
        </h1>
      </div>
      <section className="dashboard-panel pixel-panel">
        <div className="class-code-row">
          <div>
            <span className="subject-label">CLASS CODE</span>
            <strong className="class-code">{saved.code}</strong>
          </div>
          <div className="code-actions">
            <CopyButton text={saved.code} label="Copy code" />
            <CopyButton
              text={`${location.origin}/${saved.code}`}
              label="Copy link"
            />
          </div>
        </div>
        {freshKey && (
          <div className="teacher-key-notice">
            <h3>Keep your teacher key</h3>
            <p>
              {stored
                ? "Saved on this device. Keep a copy to open your dashboard elsewhere."
                : "This browser could not save your key. Copy it before leaving this page."}{" "}
              Students only need the class code.
            </p>
            <input
              aria-label="Your private teacher key"
              readOnly
              value={saved.teacherToken}
            />
            <div className="inline-actions">
              <CopyButton text={saved.teacherToken} label="Copy teacher key" />
              <button className="text-button" onClick={onDismissKey}>
                Saved it
              </button>
            </div>
          </div>
        )}
        {!data && !poll.error && (
          <p className="empty-state" role="status">
            Opening your classroom…
          </p>
        )}
        {data && (
          <>
            <div className="dashboard-stats">
              <div>
                <strong>{data.members.length}</strong>
                <span>Students</span>
              </div>
              <div>
                <strong>{data.members.filter((m) => m.ready).length}</strong>
                <span>Ready for boss</span>
              </div>
              <div>
                <strong>{data.groups.length}</strong>
                <span>Parties</span>
              </div>
            </div>
            <div className="world-status" aria-label="Lesson preparation">
              {(["sports", "fantasy"] as const).map((world) => (
                <span
                  key={world}
                  className={data.worldsReady.includes(world) ? "ready" : ""}
                >
                  <PixelIcon
                    name={world === "sports" ? "football" : "sword"}
                    size={14}
                  />
                  {world === "sports" ? "Sports" : "Fantasy"} ·{" "}
                  {data.worldsReady.includes(world)
                    ? "Ready"
                    : data.worldErrors?.[world]
                      ? "Not ready"
                      : "Preparing"}
                </span>
              ))}
            </div>
            {(["sports", "fantasy"] as const).map(
              (world) =>
                data.worldErrors?.[world] && (
                  <Notice key={world}>
                    {world === "sports" ? "Sports" : "Fantasy"} couldn't be
                    built: {data.worldErrors[world]} It will try again when a
                    student picks it.
                  </Notice>
                ),
            )}
            <div
              className="dashboard-tabs"
              role="group"
              aria-label="Classroom view"
            >
              {(["students", "groups", "topics"] as const).map((view) => (
                <button
                  key={view}
                  className={tab === view ? "active" : ""}
                  aria-pressed={tab === view}
                  onClick={() => setTab(view)}
                >
                  {view === "groups"
                    ? "Parties"
                    : view === "topics"
                      ? "Review topics"
                      : "Students"}
                </button>
              ))}
            </div>
            {tab === "students" && (
              <div className="dashboard-list">
                {!data.members.length && (
                  <p className="empty-state">
                    Share the class code. Students will appear here as they
                    join.
                  </p>
                )}
                {data.members.map((person) => (
                  <article className="dashboard-row" key={person.id}>
                    <div>
                      <h3>{person.name}</h3>
                      <p>
                        {person.theme === "sports"
                          ? "Sports"
                          : person.theme === "fantasy"
                            ? "Fantasy"
                            : "No world yet"}
                      </p>
                    </div>
                    <div className="row-metric">
                      <strong>
                        {person.accuracy === null
                          ? "—"
                          : `${Math.round(person.accuracy * 100)}%`}
                      </strong>
                      <span>
                        {person.groupCode
                          ? "In a party"
                          : person.ready
                            ? "Ready"
                            : `${person.attempts} answered`}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {tab === "groups" && (
              <div className="dashboard-list">
                {!data.groups.length && (
                  <p className="empty-state">
                    Parties form after students finish their solo round.
                  </p>
                )}
                {data.groups.map((group) => (
                  <article className="dashboard-row" key={group.code}>
                    <div>
                      <h3>{group.members.join(" + ")}</h3>
                      <p>
                        {group.theme === "sports" ? "Sports" : "Fantasy"} ·{" "}
                        {group.code}
                      </p>
                    </div>
                    <span
                      className={`status-chip ${group.boss === "defeated" ? "ready" : ""}`}
                    >
                      {group.boss === "defeated"
                        ? "Boss defeated"
                        : group.boss === "active"
                          ? "Fighting boss"
                          : "Gathering"}
                    </span>
                  </article>
                ))}
              </div>
            )}
            {tab === "topics" && (
              <div className="dashboard-list">
                {!data.topics.length && (
                  <p className="empty-state">
                    Topics appear as students answer questions.
                  </p>
                )}
                {data.topics.map((topic) => (
                  <article className="dashboard-row" key={topic.subtopic}>
                    <div>
                      <h3>{topic.subtopic}</h3>
                      <p>{topic.attempts} answers · weakest topics first</p>
                    </div>
                    <strong className="topic-accuracy">
                      {Math.round(topic.accuracy * 100)}%
                    </strong>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {poll.error && <Notice>{poll.error}</Notice>}
        <button className="text-button refresh-link" onClick={poll.refresh}>
          <PixelIcon name="retry" size={14} />
          Refresh classroom
        </button>
      </section>
      <button className="below-back text-button" onClick={onBack}>
        <PixelIcon name="arrowLeft" size={15} />
        My classrooms
      </button>
    </>
  );
}

export function TeacherDesk({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [classes, setClasses] = useState(readClasses);
  const [selected, setSelected] = useState<SavedClass | null>(null);
  const [view, setView] = useState<"list" | "details" | "material" | "recover">(
    "list",
  );
  const [name, setName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [level, setLevel] = useState("high school");
  const [material, setMaterial] = useState("");
  const [materialTab, setMaterialTab] = useState<"upload" | "paste">("upload");
  const [filename, setFilename] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [freshKey, setFreshKey] = useState(false);
  const [stored, setStored] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRead = useRef(0);
  useEffect(() => {
    onBusy(busy || reading);
    return () => onBusy(false);
  }, [busy, reading, onBusy]);
  useEffect(
    () => () => {
      pending.current?.abort();
      fileRead.current++;
    },
    [],
  );
  async function loadFile(file?: File) {
    if (!file || busy || reading) return;
    const request = ++fileRead.current;
    setReading(true);
    setError("");
    try {
      const content = await readStudyFile(file);
      if (request !== fileRead.current) return;
      setMaterial(content);
      setFilename(file.name);
    } catch (err) {
      if (request === fileRead.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not read that file. Please try again.",
        );
    } finally {
      if (request === fileRead.current) setReading(false);
    }
  }
  function save(saved: SavedClass) {
    const next = [saved, ...classes.filter((cls) => cls.code !== saved.code)];
    setStored(remember("classes", next));
    setClasses(next);
    setSelected(saved);
  }
  async function submit() {
    if (busy || reading) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    pending.current = controller;
    try {
      if (view === "recover") {
        const saved = {
          code: code.trim().toUpperCase(),
          name: "Classroom",
          teacherToken: token.trim(),
        };
        const data = await getDashboard(saved, controller.signal);
        if (!controller.signal.aborted) {
          save({ ...saved, name: data.name });
          setFreshKey(false);
        }
      } else {
        const saved = await createClass(
          {
            name: name.trim(),
            teacherName: teacherName.trim(),
            material: material.trim(),
            level,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          save(saved);
          setFreshKey(true);
          setMaterial("");
          setMaterialTab("upload");
          setFilename("");
          setName("");
        }
      }
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Could not open your class.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (selected)
    return (
      <TeacherDashboard
        key={selected.code}
        saved={selected}
        freshKey={freshKey}
        stored={stored}
        onDismissKey={() => setFreshKey(false)}
        onBack={() => {
          setSelected(null);
          setFreshKey(false);
          setView("list");
          setError("");
        }}
      />
    );
  return (
    <>
      <div className="page-intro">
        <h1>
          {view === "material" ? "Bring the lesson." : "Your teacher desk."}
          <br />
          <span>
            {view === "list"
              ? "A class full of possibility."
              : view === "recover"
                ? "Welcome back."
                : view === "material"
                  ? "We’ll build both worlds."
                  : "Start a classroom."}
          </span>
        </h1>
      </div>
      {view === "list" ? (
        <section className="teacher-panel pixel-panel">
          <div className="panel-heading">
            <h2>My classrooms</h2>
            <PixelSprite kind="coach" />
          </div>
          {classes.length ? (
            <div className="saved-classes">
              {classes.map((cls) => (
                <button
                  key={cls.code}
                  onClick={() => {
                    setSelected(cls);
                    setFreshKey(false);
                  }}
                >
                  <span>
                    <strong>{cls.name}</strong>
                    <small>{cls.code}</small>
                  </span>
                  <PixelIcon name="arrow" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              Create a class and share its code with your students.
            </p>
          )}
          <button
            className="primary-button full-width"
            onClick={() => {
              setView("details");
              setError("");
            }}
          >
            <PixelIcon name="plus" size={16} />
            Create a class
          </button>
          <button
            className="text-button refresh-link"
            onClick={() => {
              setView("recover");
              setError("");
            }}
          >
            Open with a teacher key
          </button>
        </section>
      ) : (
        <form
          className="teacher-panel pixel-panel form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (view === "details") setView("material");
            else void submit();
          }}
        >
          {view === "details" && (
            <>
              <label className="field-label">
                Class name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  placeholder="Biology 101"
                />
              </label>
              <label className="field-label">
                Your name
                <input
                  value={teacherName}
                  onChange={(event) => setTeacherName(event.target.value)}
                  maxLength={60}
                  required
                  autoComplete="name"
                  placeholder="Professor Oak"
                />
              </label>
              <label className="field-label">
                Study level
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  <option value="middle school">Middle school</option>
                  <option value="high school">High school</option>
                  <option value="intro college">Intro college</option>
                  <option value="advanced college">Advanced college</option>
                </select>
              </label>
            </>
          )}
          {view === "material" && (
            <>
              <p className="field-help">
                {name} · {level}
              </p>
              <div>
                <div className="section-heading">
                  <label
                    htmlFor={
                      materialTab === "paste"
                        ? "class-study-notes"
                        : "class-study-file"
                    }
                  >
                    Class study material
                  </label>
                  <div
                    className="material-tabs"
                    role="group"
                    aria-label="Class study material input method"
                  >
                    <button
                      type="button"
                      className={materialTab === "upload" ? "active" : ""}
                      aria-pressed={materialTab === "upload"}
                      disabled={busy || reading}
                      onClick={() => {
                        setMaterialTab("upload");
                        setError("");
                      }}
                    >
                      Upload
                    </button>
                    <button
                      type="button"
                      className={materialTab === "paste" ? "active" : ""}
                      aria-pressed={materialTab === "paste"}
                      disabled={busy || reading}
                      onClick={() => {
                        setMaterialTab("paste");
                        setDragging(false);
                        setError("");
                      }}
                    >
                      Paste text
                    </button>
                  </div>
                </div>
                <input
                  ref={fileInput}
                  id="class-study-file"
                  aria-label="Upload class study material"
                  className="visually-hidden"
                  tabIndex={-1}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  disabled={busy || reading}
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                {reading || busy ? (
                  <ContentProgress
                    sprite="coach"
                    label={reading ? "Reading class notes…" : "Creating your classroom…"}
                  />
                ) : materialTab === "upload" ? (
                  <button
                    type="button"
                    className={`upload-zone ${dragging ? "dragging" : ""} ${material.trim() ? "has-file" : ""}`}
                    disabled={busy || reading}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!busy && !reading) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      void loadFile(event.dataTransfer.files[0]);
                    }}
                  >
                    <PixelIcon
                      name={material.trim() ? "file" : "upload"}
                      size={30}
                    />
                    <strong>
                      {reading
                        ? "Reading your notes…"
                        : filename ||
                          (material.trim()
                            ? "Your pasted notes are ready"
                            : "Drop class notes here")}
                    </strong>
                  </button>
                ) : (
                  <div className="notes-wrapper">
                    <textarea
                      id="class-study-notes"
                      value={material}
                      onChange={(event) => {
                        setMaterial(event.target.value);
                        setFilename("");
                        setError("");
                      }}
                      maxLength={20000}
                      rows={8}
                      required
                      disabled={busy || reading}
                      placeholder="Paste the notes your class will study…"
                    />
                    <span className="character-count">
                      {material.length.toLocaleString()} / 20,000 characters
                    </span>
                  </div>
                )}
              </div>
              <p className="field-help">
                Students choose Sports or Fantasy. Both use this lesson.
              </p>
            </>
          )}
          {view === "recover" && (
            <>
              <label className="field-label">
                Class code
                <input
                  className="code-input"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  maxLength={6}
                  minLength={6}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field-label">
                Teacher key
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  autoComplete="off"
                  required
                  disabled={busy}
                />
              </label>
            </>
          )}
          {error && <Notice>{error}</Notice>}
          <button
            className="primary-button full-width"
            disabled={busy || reading || (view === "material" && !material.trim())}
          >
            {reading
              ? "Reading your notes…"
              : busy
                ? "Opening your classroom…"
                : view === "details"
                  ? "Continue to lesson"
                  : view === "recover"
                    ? "Open dashboard"
                    : "Create class"}
            <PixelIcon name="arrow" size={16} />
          </button>
        </form>
      )}
      {view !== "list" && (
        <button
          className="below-back text-button"
          disabled={busy || reading}
          onClick={() => {
            setView(view === "material" ? "details" : "list");
            setError("");
          }}
        >
          <PixelIcon name="arrowLeft" size={15} />
          Back
        </button>
      )}
    </>
  );
}
