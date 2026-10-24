// "Hear it explained" button: plays the AI coach's voice explanation.
// Goes in src/CoachVoice.tsx. Use it like:
//   <CoachVoice topic="Parts of a cell" interest="Football" />
import { useState } from "react";

type Props = {
  topic: string;
  interest: string;
  facts?: string[]; // optional: key facts the speech must cover
};

type CoachReply = { script: string; audioBase64: string | null; mimeType: string; persona: string };

export default function CoachVoice({ topic, interest, facts }: Props) {
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [error, setError] = useState("");

  // Backup: the browser's built-in voice, if Gemini's audio isn't available
  function speakWithBrowser(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, " "));
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  async function getVoice() {
    setLoading(true);
    setError("");
    setReply(null);
    window.speechSynthesis?.cancel();
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, interest, facts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReply(data);
      if (!data.audioBase64) speakWithBrowser(data.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "#111827",
        color: "#fff",
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <button
        onClick={getVoice}
        disabled={loading}
        style={{
          padding: "12px 20px",
          fontSize: 16,
          borderRadius: 8,
          background: "#f59e0b",
          color: "#111",
          border: "none",
          fontWeight: 700,
        }}
      >
        {loading ? "Your coach is warming up..." : `🎙️ Hear it from a ${interest} pro`}
      </button>
      {loading && <p style={{ color: "#d1d5db", marginBottom: 0 }}>This takes about 10-20 seconds.</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {reply && (
        <div style={{ marginTop: 14 }}>
          {reply.audioBase64 ? (
            <audio controls autoPlay src={`data:${reply.mimeType};base64,${reply.audioBase64}`} style={{ width: "100%" }} />
          ) : (
            <button onClick={() => speakWithBrowser(reply.script)}>▶ Play again (browser voice)</button>
          )}
          <div>
            <button onClick={() => setShowScript(!showScript)} style={{ marginTop: 10 }}>
              {showScript ? "Hide transcript" : "Show transcript"}
            </button>
          </div>
          {showScript && (
            <p style={{ whiteSpace: "pre-wrap", color: "#e5e7eb", lineHeight: 1.6 }}>
              {reply.script.replace(/<short pause>/g, "…")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}