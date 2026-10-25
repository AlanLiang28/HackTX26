import { useEffect, useState } from "react";
import { PixelSprite } from "./PixelSprite";
import type { SpriteKind } from "./PixelSprite";

// Without expectedMs: an endless "working" animation. With it: an estimated bar that fills toward 95% over
// about that long (~87% at expectedMs, then ever slower), so it never claims to finish before the server
// does, and walks through `stages` as it fills. The server sends no progress, so this is an estimate.
export function ContentProgress({
  sprite,
  label,
  expectedMs,
  stages = [],
}: {
  sprite: SpriteKind;
  label: string;
  expectedMs?: number;
  stages?: string[];
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!expectedMs) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - start), 200);
    return () => window.clearInterval(timer);
  }, [expectedMs]);

  const estimated = expectedMs !== undefined;
  const fraction = estimated ? 0.95 * (1 - Math.exp(-elapsed / (expectedMs / 2.5))) : 0;
  const percent = Math.round(fraction * 100);
  // Stages split the 0-95% range evenly.
  const stage = stages.length
    ? stages[Math.min(stages.length - 1, Math.floor((fraction / 0.95) * stages.length))]
    : label;

  return (
    <div
      className={`content-progress ${estimated ? "estimated" : ""}`}
      style={estimated ? ({ "--progress": fraction } as React.CSSProperties) : undefined}
    >
      <div
        className="content-progress-track"
        role="progressbar"
        aria-label={label}
        {...(estimated
          ? { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent }
          : { "aria-valuetext": "In progress" })}
      >
        <span className="content-progress-fill" aria-hidden="true" />
        <span className="content-progress-runner" aria-hidden="true">
          <PixelSprite kind={sprite} />
        </span>
      </div>
      <p className="content-progress-label" role="status">
        {estimated ? stage : label}
        {estimated && (
          <span className="content-progress-percent"> {percent}%</span>
        )}
      </p>
    </div>
  );
}
