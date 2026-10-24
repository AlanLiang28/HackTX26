import { useEffect, useState } from "react";
import CoachVoice from "./CoachVoice";

// ---- Types: the shape of the data from the server ----
type Mapping = { concept: string; analogy: string; explanation: string };
type QuizQuestion = { question: string; options: string[]; answer: number };
type Content = {
  title: string;
  overview: string;
  
  mappings: Mapping[];
  summary: string;
  quiz: QuizQuestion[];
};
type Session = { created_at?: string; topic: string; interest: string; level: string; content: Content };
type Stat = { day: string; sessions: number };

const interestIdeas = ["Football", "Basketball", "Minecraft", "Cooking", "Music", "Marvel movies"];

export default function App() {
  const [topic, setTopic] = useState("");
  const [interest, setInterest] = useState("");
  const [level, setLevel] = useState("high school");
  const [result, setResult] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);

  async function loadSidebar() {
    try {
      const [h, s] = await Promise.all([
        fetch("/api/history").then((r) => r.json()),
        fetch("/api/stats").then((r) => r.json()),
      ]);
      setHistory(h);
      setStats(s);
    } catch {
      // sidebar is optional; ignore errors
    }
  }

  useEffect(() => {
    loadSidebar();
  }, []);

  async function explain() {
    setLoading(true);
    setError("");
    setResult(null);
    setAnswers({});
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, interest, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      loadSidebar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function openFromHistory(s: Session) {
    setResult(s);
    setAnswers({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const card: React.CSSProperties = {
    background: "#ffffff",
    color: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };
  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 10,
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #ccc",
    marginBottom: 12,
  };
  const maxSessions = Math.max(1, ...stats.map((s) => s.sessions));

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* ---- Main column ---- */}
        <main style={{ flex: "1 1 560px", minWidth: 0 }}>
          <h1 style={{ color: "#1a1a1a", marginBottom: 4 }}>Learn It Your Way</h1>
          <p style={{ color: "#555", marginTop: 0 }}>Any topic, explained through what you already love.</p>

          <div style={card}>
            <label>What do you want to learn?</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Parts of a cell, how loans work, the French Revolution..."
              rows={3}
              style={input}
            />
            <label>What are you into?</label>
            <input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="e.g. Football"
              style={input}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: -4, marginBottom: 12 }}>
              {interestIdeas.map((i) => (
                <button key={i} onClick={() => setInterest(i)} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999 }}>
                  {i}
                </button>
              ))}
            </div>
            <label>Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={input}>
              <option>middle school</option>
              <option>high school</option>
              <option>college</option>
            </select>
            <button
              onClick={explain}
              disabled={loading || !topic.trim() || !interest.trim()}
              style={{ padding: "12px 20px", fontSize: 16, borderRadius: 8, background: "#4f46e5", color: "white", border: "none" }}
            >
              {loading ? "Building your analogy..." : "Explain it my way ✨"}
            </button>
            {error && <p style={{ color: "#c62828" }}>{error}</p>}
          </div>

          {result && (
            <>
              <div style={card}>
                <small style={{ color: "#4f46e5" }}>
                  {result.topic} × {result.interest}
                </small>
                <h2 style={{ marginTop: 4 }}>{result.content.title}</h2>
                <p>{result.content.overview}</p>
              </div>
              <CoachVoice topic={result.topic} interest={result.interest} />

              {result.content.mappings.map((m, i) => (
                <div key={i} style={{ ...card, borderLeft: "5px solid #4f46e5" }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {m.concept} <span style={{ color: "#999" }}>→</span> {m.analogy}
                  </div>
                  <p style={{ marginBottom: 0 }}>{m.explanation}</p>
                </div>
                
              ))}

              <div style={{ ...card, background: "#eef2ff" }}>
                <strong>In short: </strong>
                {result.content.summary}
              </div>

              {/* ---- Quick quiz ---- */}
              <div style={card}>
                <h3 style={{ marginTop: 0 }}>Check yourself</h3>
                {result.content.quiz.map((q, qi) => (
                  <div key={qi} style={{ marginBottom: 16 }}>
                    <p style={{ fontWeight: 600 }}>
                      {qi + 1}. {q.question}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {q.options.map((opt, oi) => {
                        const picked = answers[qi];
                        let bg = "#f3f3f3";
                        if (picked !== undefined) {
                          if (oi === q.answer) bg = "#b6f2c0";
                          else if (oi === picked) bg = "#f7b6b6";
                        }
                        return (
                          <button
                            key={oi}
                            onClick={() => picked === undefined && setAnswers({ ...answers, [qi]: oi })}
                            style={{ textAlign: "left", padding: 10, background: bg, color: "#000", borderRadius: 6 }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(answers).length === result.content.quiz.length && (
                  <p style={{ fontWeight: 700 }}>
                    Score: {result.content.quiz.filter((q, i) => answers[i] === q.answer).length} / {result.content.quiz.length}
                  </p>
                )}
              </div>
            </>
          )}
        </main>

        {/* ---- Sidebar: stats + history from Tiger Data ---- */}
        <aside style={{ flex: "1 1 260px" }}>
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Study sessions this week</h3>
            {stats.length === 0 && <p style={{ color: "#777" }}>No sessions yet.</p>}
            {stats.map((s) => (
              <div key={s.day} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 50, fontSize: 13 }}>
                  {new Date(s.day).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })} 
                </span>
                <div style={{ height: 12, width: `${(s.sessions / maxSessions) * 100}%`, background: "#4f46e5", borderRadius: 4 }} />
                <span style={{ fontSize: 13 }}>{s.sessions}</span>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Recent topics</h3>
            {history.length === 0 && <p style={{ color: "#777" }}>Nothing yet.</p>}
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => openFromHistory(h)}
                style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: 8, borderRadius: 6 }}
              >
                <div style={{ fontWeight: 600 }}>{h.topic}</div>
                <small style={{ color: "#666" }}>via {h.interest}</small>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}