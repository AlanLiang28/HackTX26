import { useEffect, useState } from 'react'

export function DialogueBox({ speaker, text, actionLabel, onContinue }: { speaker: string; text: string; actionLabel: string; onContinue: () => void }) {
  const [visible, setVisible] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? text.length : 0)
  const complete = visible >= text.length
  useEffect(() => {
    if (complete) return
    const timer = window.setInterval(() => setVisible(count => Math.min(text.length, count + 3)), 18)
    return () => window.clearInterval(timer)
  }, [complete, text.length])
  return <section className="dialogue-box" aria-label={`${speaker}'s dialogue`}>
    <span className="dialogue-speaker">{speaker.toUpperCase()}</span>
    <p className="dialogue-text" aria-hidden="true"><span className="dialogue-asterisk">*</span><span>{text.slice(0, visible)}{!complete && <span className="typing-cursor">▌</span>}</span></p>
    <p className="visually-hidden" role="status">{text}</p>
    <button className="dialogue-continue" onClick={() => complete ? onContinue() : setVisible(text.length)}>{complete ? actionLabel : 'Skip typing'}<span aria-hidden="true">▼</span></button>
  </section>
}
